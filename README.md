# pi-tmux

Control independent Pi agents through tmux. All extension commands use the `t:` prefix.

## Commands

| Command | Behavior |
| --- | --- |
| `/t:commit` | Start a commit agent in a right-hand split pane, using `gpt-6-luna` with low thinking. |
| `/t:new` | Start a fresh Pi session in a new tmux window, in the same directory. |
| `/t:fork` | Start an independent copy of the current saved session in a new tmux window. |

Run these commands from Pi's terminal UI inside tmux. Reload the extension with `/reload` after installation or changes.

`/t:commit` and `/t:fork` require an idle parent. `/t:new` also works while the parent is busy.

Forking uses Pi's native `pi --fork <session-file>` CLI. It copies the saved session at its current position;
 it does not show the built-in `/fork` message picker. The original agent keeps its session.
New and forked agents use Pi's normal model configuration. Command-line-only parent settings are not forwarded.

The shared launcher handles tmux placement and launch errors. Child agents own their work and results.
Launch failures never run the task in the parent conversation. A successful launch does not guarantee successful child startup.

All agents share the working directory and files. A conversation fork does not create a Git worktree.
Avoid concurrent edits or Git operations on the same files.

## Development

```sh
npm run typecheck
npm test
```
