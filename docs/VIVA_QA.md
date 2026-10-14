# Viva questions (short answers)

**What is 3NF?**  
No non-key attribute depends on another non-key attribute. Circuit country lives on `CIRCUIT`, not on every `RACE` row.

**Why a surrogate key and a natural key?**  
`DRIVER_ID` is stable for FKs. `DRIVER_REF` matches the source and supports idempotent `MERGE`.

**How are championships calculated?**  
`V_DRIVER_STANDINGS` sums `RACE_RESULT.POINTS` per season. Rank uses window `RANK()`. Sprint points are included because they count in the real championship; GP wins filter `SESSION_TYPE = 'RACE'`.

**Why not hardcode 25-18-15?**  
Sprint scoring and fastest-lap bonuses vary. The source already applied the correct session points.

**What does the trigger do?**  
Stops `UPDATE`/`DELETE` of verified Jolpica classifications so a CRUD screen cannot rewrite history.

**Parameterized SQL?**  
Flask binds `:name` placeholders through `oracledb`. Analytics IDs are allowlisted; the client never sends raw SQL.

**Transaction example?**  
`PRC_ASSIGN_SPONSOR` inserts then `COMMIT`, or `ROLLBACK` on duplicate (`DUP_VAL_ON_INDEX`).

**INNER vs LEFT JOIN?**  
Winners use INNER JOIN (must have a result). Pit-stop counts use LEFT JOIN so races with zero stops still appear.

**Correlated subquery?**  
A subquery that references the outer driver/season to find that driver’s best finish.

**How do you prevent duplicate imports?**  
Unique constraints plus `MERGE` on natural keys. Re-running import updates in place.

**What if the API is down?**  
Cached JSON in `data/raw/` is reused. The web app never calls Jolpica.

**Licence?**  
Jolpica-F1 is an open Ergast-compatible API. Do not scrape Formula1.com; use it only as a human cross-check. Do not publish the raw dump as your own dataset.
