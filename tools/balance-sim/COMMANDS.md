# Balance simulator commands

Run from the project folder. Options go after `--`.

| Command | What it does |
|---|---|
| `npm run balance` | Plays every stage (1–10), 4 processes at a time |
| `npm run balance -- --stages 1-5` | Plays a range of stages |
| `npm run balance -- --stages 3,8,10` | Plays a list of stages |
| `npm run balance -- --jobs 2` | Number of parallel processes (default 4, never more than 5) |
| `npm run balance -- --seeds 1` | Random seeds per setup (default 3; fewer is faster but noisier) |
| `npm run balance -- --heroes Staff,Claymore` | Only these hero builds |
| `npm run balance -- --teams "starter,rares"` | Only these teams |
| `npm run balance -- --report` | Rebuilds the report from saved results, without playing |

Options can be combined, for example:

```
npm run balance -- --stages 8 --jobs 1 --seeds 1
```

## Hero builds

`Blade`, `Bow`, `Magic` (no mastery) and `Blade+CrossSlash`, `Claymore`, `Bow+Fivefold`, `Longbow`, `Magic+GreaterOrb`, `Staff` (full mastery).

## Teams

`hero only`, `starter`, `commons`, `commons no farmer`, `rares`, plus `mono <unit id>` for every fighting champion (for example `mono archer`, `mono elf`).

## Output

- `out/report.html`: the report page. Open it in a browser.
- `out/runs/stage-N.json`: raw results per stage. A rerun replaces only the stages it played.

A full stage takes about 15–25 minutes per process.
