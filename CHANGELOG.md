# Changelog

All notable changes to this project will be documented in this file.

## [1.3.1] - 2026-03-10

### Fixed
- **Null-safe idle session lookup**: Added guard to prevent crashes when session data is undefined
- **Active subagent notification suppression**: Idle notifications are now suppressed while child subagents are active (busy status)
- **Graceful child lookup fallback**: When child session lookup fails, the notification flow continues gracefully instead of crashing
- **Regression test coverage**: Added comprehensive test cases for null safety and active child suppression scenarios

### Details
The idle hook now safely handles edge cases where session data may be unavailable or child subagents are actively processing. This prevents spurious notifications and improves stability when managing complex session hierarchies.
