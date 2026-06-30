# Solutions

Candidate implementations live here, grouped by benchmark id:

```text
solutions/<benchmark-id>/
```

`bench verify <id>` uses `solutions/<id>/` by default. Passing `--solution solutions`
also resolves to `solutions/<id>/`, so the aggregate directory can be used from scripts
without repeating the benchmark id.
