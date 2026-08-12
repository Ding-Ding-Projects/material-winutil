# Notifications

The application provides transient snackbars and a session-local notification centre. It does not yet provide durable notification history across restarts.

## Behavior

Snackbars announce short status messages through a polite live region and dismiss after about 3.2 seconds. Package-operation results and prerequisite failures also create notification-centre entries with title, detail, icon, and read state.

The notification centre supports local search, selection, select all, mark read, mark unread, delete, clear history, and mark all read. Context menus provide equivalent single-item and bulk entry points.

## Configuration

There is no notification persistence setting, timeout setting, quiet-hours setting, or operating-system notification integration. Entries live in renderer memory for the current application session.

## Failure modes

- Closing the application loses the notification-centre entries.
- All snackbars use the same timeout; warning and error snackbars are not currently persistent.
- Delete and clear actions are immediate and do not use the full destructive-confirmation flow.
- The current **Export selected** route opens the generic current-view exporter; it does not yet serialize the selected notification records as a complete notification export.

## Security considerations

Notifications should contain status summaries, not credentials or raw secret material. Main-process package output is shown in the operation surface, while notification details remain concise. Session-local storage reduces retention but is not a substitute for explicit redaction.

## Verification

Renderer contracts and smoke captures cover the visible snackbar and notification-centre states. Restart persistence, warning retention, complete selected-record export, undo, and destructive bulk deletion remain incomplete.

## Suggested articles

- [Local history](local-history.md)
- [Exports and selection profiles](exports-and-selection-profiles.md)
- [Destructive confirmation](destructive-confirmation.md)

