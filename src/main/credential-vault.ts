import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { accessSync, constants as fsConstants } from "node:fs";
import { win32 as windowsPath } from "node:path";

export const CREDENTIAL_VAULT_PREFIX = "org.dingdingprojects.materialwinutil/v1/";

const TARGET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const ACCOUNT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@._+-]{0,127}$/;
const MAX_SECRET_BYTES = 2_560;
const MAX_RESPONSE_BYTES = 16_384;
const MAX_CREDENTIALS = 512;
const PROCESS_TIMEOUT_MS = 8_000;

export interface CredentialMetadata {
  readonly target: string;
  readonly account: string;
}

interface VaultRequest {
  readonly operation: "write" | "read" | "delete" | "list";
  readonly target?: string;
  readonly account?: string;
  readonly secretBase64?: string;
}

interface VaultResponse {
  readonly ok: boolean;
  readonly found?: boolean;
  readonly deleted?: boolean;
  readonly account?: string;
  readonly secretBase64?: string;
  readonly credentials?: CredentialMetadata[];
  readonly error?: string;
  readonly errorCode?: string;
}

const POWERSHELL_BRIDGE = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class MaterialWinutilCredentialNative
{
    internal const uint CRED_TYPE_GENERIC = 1;
    internal const uint CRED_PERSIST_LOCAL_MACHINE = 2;
    internal const int ERROR_NOT_FOUND = 1168;
    internal const int MAX_SECRET_BYTES = 2560;
    internal const int MAX_CREDENTIALS = 512;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct CREDENTIAL
    {
        internal uint Flags;
        internal uint Type;
        [MarshalAs(UnmanagedType.LPWStr)] internal string TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] internal string Comment;
        internal System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        internal uint CredentialBlobSize;
        internal IntPtr CredentialBlob;
        internal uint Persist;
        internal uint AttributeCount;
        internal IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] internal string TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] internal string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWrite(ref CREDENTIAL credential, uint flags);

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredDelete(string target, uint type, uint flags);

    [DllImport("advapi32.dll", EntryPoint = "CredEnumerateW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredEnumerate(string filter, uint flags, out uint count, out IntPtr credentials);

    [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = false)]
    private static extern void CredFree(IntPtr buffer);

    public sealed class Entry
    {
        public string Target = "";
        public string Account = "";
        public byte[] Secret = Array.Empty<byte>();
    }

    public static void Write(string target, string account, byte[] secret)
    {
        IntPtr blob = IntPtr.Zero;
        try
        {
            blob = Marshal.AllocHGlobal(secret.Length);
            Marshal.Copy(secret, 0, blob, secret.Length);
            var credential = new CREDENTIAL
            {
                Type = CRED_TYPE_GENERIC,
                TargetName = target,
                UserName = account,
                CredentialBlobSize = (uint)secret.Length,
                CredentialBlob = blob,
                Persist = CRED_PERSIST_LOCAL_MACHINE
            };
            if (!CredWrite(ref credential, 0))
                throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        finally
        {
            if (blob != IntPtr.Zero)
            {
                for (var index = 0; index < secret.Length; index++) Marshal.WriteByte(blob, index, 0);
                Marshal.FreeHGlobal(blob);
            }
        }
    }

    public static Entry Read(string target)
    {
        IntPtr pointer;
        if (!CredRead(target, CRED_TYPE_GENERIC, 0, out pointer))
        {
            var error = Marshal.GetLastWin32Error();
            if (error == ERROR_NOT_FOUND) return null;
            throw new Win32Exception(error);
        }
        try
        {
            var credential = Marshal.PtrToStructure<CREDENTIAL>(pointer);
            if (credential.CredentialBlobSize < 1 || credential.CredentialBlobSize > MAX_SECRET_BYTES)
                throw new InvalidOperationException("Credential blob size is outside the application bound.");
            var secret = new byte[checked((int)credential.CredentialBlobSize)];
            if (secret.Length > 0) Marshal.Copy(credential.CredentialBlob, secret, 0, secret.Length);
            return new Entry { Target = credential.TargetName, Account = credential.UserName, Secret = secret };
        }
        finally
        {
            CredFree(pointer);
        }
    }

    public static bool Delete(string target)
    {
        if (CredDelete(target, CRED_TYPE_GENERIC, 0)) return true;
        var error = Marshal.GetLastWin32Error();
        if (error == ERROR_NOT_FOUND) return false;
        throw new Win32Exception(error);
    }

    public static Entry[] List(string prefix)
    {
        uint count;
        IntPtr pointers;
        if (!CredEnumerate(prefix + "*", 0, out count, out pointers))
        {
            var error = Marshal.GetLastWin32Error();
            if (error == ERROR_NOT_FOUND) return Array.Empty<Entry>();
            throw new Win32Exception(error);
        }
        try
        {
            if (count > MAX_CREDENTIALS)
                throw new InvalidOperationException("Credential enumeration exceeds the application bound.");
            var result = new Entry[checked((int)count)];
            for (var index = 0; index < result.Length; index++)
            {
                var pointer = Marshal.ReadIntPtr(pointers, checked(index * IntPtr.Size));
                var credential = Marshal.PtrToStructure<CREDENTIAL>(pointer);
                result[index] = new Entry { Target = credential.TargetName, Account = credential.UserName };
            }
            return result;
        }
        finally
        {
            CredFree(pointers);
        }
    }
}
'@

function Write-Response([hashtable] $Value) {
    [Console]::Out.Write(($Value | ConvertTo-Json -Compress -Depth 4))
}

try {
    $phase = 'request'
    $requestText = [Console]::In.ReadToEnd()
    if ([Text.Encoding]::UTF8.GetByteCount($requestText) -gt 8192) { throw 'request_too_large' }
    $request = $requestText | ConvertFrom-Json
    $prefix = 'org.dingdingprojects.materialwinutil/v1/'
    $targetPattern = '^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$'
    $accountPattern = '^[A-Za-z0-9][A-Za-z0-9@._+-]{0,127}$'
    $operations = @('write', 'read', 'delete', 'list')
    if ($operations -notcontains [string]$request.operation) { throw 'invalid_operation' }

    if ($request.operation -eq 'list') {
        if ((@($request.PSObject.Properties.Name) -join ',') -ne 'operation') { throw 'invalid_request_shape' }
        $items = @([MaterialWinutilCredentialNative]::List($prefix) | ForEach-Object {
            if (-not $_.Target.StartsWith($prefix, [StringComparison]::Ordinal)) { throw 'ownership_violation' }
            @{ target = $_.Target.Substring($prefix.Length); account = $_.Account }
        })
        Write-Response @{ ok = $true; credentials = $items }
        exit 0
    }

    $target = [string]$request.target
    $account = [string]$request.account
    $actualFields = @($request.PSObject.Properties.Name | Sort-Object) -join ','
    $expectedFields = if ($request.operation -eq 'write') { 'account,operation,secretBase64,target' } else { 'account,operation,target' }
    if ($actualFields -ne $expectedFields) { throw 'invalid_request_shape' }
    if ($target -notmatch $targetPattern -or $account -notmatch $accountPattern) { throw 'invalid_identity' }
    $ownedTarget = $prefix + $target

    if ($request.operation -eq 'write') {
        $phase = 'decode'
        $secret = [Convert]::FromBase64String([string]$request.secretBase64)
        try {
            if ($secret.Length -lt 1 -or $secret.Length -gt 2560) { throw 'invalid_secret_size' }
            $phase = 'native_write'
            [MaterialWinutilCredentialNative]::Write($ownedTarget, $account, $secret)
            $phase = 'response'
            Write-Response @{ ok = $true }
        } finally {
            if ($null -ne $secret) { [Array]::Clear($secret, 0, $secret.Length) }
        }
        exit 0
    }

    $entry = [MaterialWinutilCredentialNative]::Read($ownedTarget)
    if ($null -eq $entry) {
        Write-Response @{ ok = $true; found = $false; deleted = $false }
        exit 0
    }
    if (-not [String]::Equals($entry.Account, $account, [StringComparison]::Ordinal)) {
        if ($entry.Secret.Length -gt 0) { [Array]::Clear($entry.Secret, 0, $entry.Secret.Length) }
        throw 'account_mismatch'
    }

    if ($request.operation -eq 'read') {
        try {
            Write-Response @{ ok = $true; found = $true; account = $entry.Account; secretBase64 = [Convert]::ToBase64String($entry.Secret) }
        } finally {
            if ($entry.Secret.Length -gt 0) { [Array]::Clear($entry.Secret, 0, $entry.Secret.Length) }
        }
        exit 0
    }

    if ($request.operation -eq 'delete') {
        if ($entry.Secret.Length -gt 0) { [Array]::Clear($entry.Secret, 0, $entry.Secret.Length) }
        $deleted = [MaterialWinutilCredentialNative]::Delete($ownedTarget)
        Write-Response @{ ok = $true; deleted = $deleted }
        exit 0
    }

    throw 'invalid_operation'
} catch {
    $safeCode = switch -Regex ($_.Exception.GetType().FullName) {
        'Win32Exception$' { 'native_api_failed'; break }
        'FormatException$' { 'invalid_encoding'; break }
        'ArgumentException$' { 'invalid_request'; break }
        default { 'bridge_failed' }
    }
    Write-Response @{ ok = $false; error = 'Credential Manager operation failed.'; errorCode = ($safeCode + '_' + $phase) }
    exit 0
}
`;

function validateTarget(target: unknown): asserts target is string {
  if (typeof target !== "string" || !TARGET_PATTERN.test(target)) {
    throw new Error("Credential target must be 1-96 ASCII letters, digits, dots, underscores, or hyphens.");
  }
}

function validateAccount(account: unknown): asserts account is string {
  if (typeof account !== "string" || !ACCOUNT_PATTERN.test(account)) {
    throw new Error("Credential account must be 1-128 bounded ASCII identity characters.");
  }
}

function validateSecret(secret: Uint8Array): void {
  if (secret.byteLength < 1 || secret.byteLength > MAX_SECRET_BYTES) {
    throw new Error(`Credential secret must contain 1-${MAX_SECRET_BYTES} bytes.`);
  }
}

function windowsSystemRoot(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !windowsPath.isAbsolute(systemRoot) || /[\x00-\x1f"]/.test(systemRoot)) {
    throw new Error("The Windows system root is unavailable.");
  }
  return windowsPath.normalize(systemRoot);
}

function powershellExecutable(): string {
  const executable = windowsPath.join(windowsSystemRoot(), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  accessSync(executable, fsConstants.X_OK);
  return executable;
}

function boundedEnvironment(): NodeJS.ProcessEnv {
  const systemRoot = windowsSystemRoot();
  const environment: NodeJS.ProcessEnv = {
    SystemRoot: systemRoot,
    WINDIR: systemRoot
  };
  return environment;
}

function decodeCanonicalBase64(value: unknown): Buffer {
  if (typeof value !== "string" || value.length < 4 || value.length > 3_416 || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Credential Manager returned an invalid credential.");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    decoded.fill(0);
    throw new Error("Credential Manager returned an invalid credential.");
  }
  return decoded;
}

async function invokeCredentialManager(request: VaultRequest): Promise<VaultResponse> {
  if (process.platform !== "win32") {
    throw new Error("Windows Credential Manager is available only on Windows.");
  }

  const encodedBridge = Buffer.from(POWERSHELL_BRIDGE, "utf16le").toString("base64");
  const payload = Buffer.from(JSON.stringify(request), "utf8");
  if (payload.length > 8_192) {
    payload.fill(0);
    throw new Error("Credential Manager request is too large.");
  }

  return await new Promise<VaultResponse>((resolve, reject) => {
    const child = spawn(
      powershellExecutable(),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedBridge],
      {
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "ignore"],
        env: boundedEnvironment()
      }
    );
    const chunks: Buffer[] = [];
    let responseBytes = 0;
    let settled = false;

    const finishWithError = (message: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      reject(new Error(message));
    };

    const timeout = setTimeout(() => {
      finishWithError("Credential Manager operation timed out.");
    }, PROCESS_TIMEOUT_MS);
    timeout.unref();

    child.once("error", () => finishWithError("Credential Manager process could not start."));
    child.stdout.on("data", (chunk: Buffer) => {
      responseBytes += chunk.length;
      if (responseBytes > MAX_RESPONSE_BYTES) {
        finishWithError("Credential Manager returned an oversized response.");
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.once("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      let response: VaultResponse;
      try {
        response = JSON.parse(Buffer.concat(chunks).toString("utf8")) as VaultResponse;
      } catch {
        reject(new Error("Credential Manager returned an invalid response."));
        return;
      }
      if (!response.ok) {
        reject(new Error(`Credential Manager operation failed (${response.errorCode ?? "unknown"}).`));
        return;
      }
      resolve(response);
    });

    child.stdin.on("error", () => finishWithError("Credential Manager request could not be delivered."));
    child.stdin.end(payload, () => payload.fill(0));
  });
}

export async function writeCredential(target: string, account: string, secret: Uint8Array): Promise<void> {
  validateTarget(target);
  validateAccount(account);
  validateSecret(secret);
  const request: VaultRequest = {
    operation: "write",
    target,
    account,
    secretBase64: Buffer.from(secret).toString("base64")
  };
  await invokeCredentialManager(request);
}

export async function readCredential(target: string, account: string): Promise<Buffer | null> {
  validateTarget(target);
  validateAccount(account);
  const response = await invokeCredentialManager({ operation: "read", target, account });
  if (!response.found) return null;
  if (response.account !== account) {
    throw new Error("Credential Manager returned an invalid credential.");
  }
  const secret = decodeCanonicalBase64(response.secretBase64);
  validateSecret(secret);
  return secret;
}

export async function deleteCredential(target: string, account: string): Promise<boolean> {
  validateTarget(target);
  validateAccount(account);
  const response = await invokeCredentialManager({ operation: "delete", target, account });
  return response.deleted === true;
}

export async function listCredentials(): Promise<readonly CredentialMetadata[]> {
  const response = await invokeCredentialManager({ operation: "list" });
  if (!Array.isArray(response.credentials)) {
    throw new Error("Credential Manager returned an invalid credential list.");
  }
  if (response.credentials.length > MAX_CREDENTIALS) {
    throw new Error("Credential Manager returned too many credentials.");
  }
  return response.credentials.map((credential) => {
    validateTarget(credential.target);
    validateAccount(credential.account);
    return Object.freeze({ target: credential.target, account: credential.account });
  });
}
