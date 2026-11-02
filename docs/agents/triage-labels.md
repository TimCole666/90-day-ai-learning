# Triage Labels

Map canonical roles to these local ticket status strings.

| Canonical role | Tracker string | Meaning |
|---|---|---|
| `needs-triage` | `needs-triage` | Maintainer evaluation needed |
| `needs-info` | `needs-info` | Waiting for reporter information |
| `ready-for-agent` | `ready-for-agent` | Fully specified for autonomous implementation |
| `ready-for-human` | `ready-for-human` | Human implementation required |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill names a triage role, use its mapped string in the ticket's
`Status:` line. Edit the tracker-string column to change the vocabulary.
