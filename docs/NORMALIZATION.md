# Functional dependencies and 3NF decisions

## Why not one wide “results” table?

A spreadsheet of race weekend facts would repeat driver names, team names, circuit location, and season metadata on every row (redundancy and update anomalies). The schema splits those repeating groups.

## Selected functional dependencies

| Relation | Determinant → dependents |
|----------|--------------------------|
| COUNTRY | country_id → country_name, country_code |
| SEASON | season_year → season_name, start_date, end_date |
| TEAM | team_id → constructor_ref, team_name, nationality |
| DRIVER | driver_id → driver_ref, names, dob, nationality |
| CIRCUIT | circuit_id → circuit_ref, name, locality, country_id, lat/long |
| RACE | race_id → season_year, round_number, circuit_id, race_name, date |
| RACE | (season_year, round_number) → race_id (alternate key) |
| RACE_RESULT | (race_id, driver_id, session_type) → team_id, points, status, … |
| QUALIFYING_RESULT | (race_id, driver_id, session_type) → position, Q1/Q2/Q3 |
| DRIVER_CONTRACT | (driver_id, team_id, season_year) → car_number |
| TEAM_SPONSOR | (team_id, sponsor_id, season_year) → deal_note |

## 3NF rationale

- **Team on a result** is stored on `RACE_RESULT` because a driver can change teams mid-season; the team that scored those points is a fact of that session, not only of `DRIVER_CONTRACT`.
- **Nationality vs country**: source nationality (`Dutch`) is not the same as a circuit country (`Netherlands`). Both are kept; `COUNTRY_ID` is a derived convenience, not a replacement for the source string.
- **Sprint vs GP**: session type is part of the result key so sprint points cannot collapse into GP rows.
- **Sponsors** are not attributes of `TEAM` because a team has many sponsors across seasons (many-to-many).

Transitive dependency avoided: circuit country is not stored on `RACE`; `RACE → CIRCUIT_ID → COUNTRY_ID`.
