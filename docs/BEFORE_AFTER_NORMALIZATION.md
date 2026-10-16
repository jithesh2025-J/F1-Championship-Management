# Before Normalization vs After Normalization

A visual comparison of database tables before and after normalization for **DBMS Review 1**.

> [!NOTE]
> The unnormalized table below is an **illustrative teaching example** constructed to demonstrate data redundancy and repeating groups. The normalized tables follow the actual project schema implemented in [`database/01_schema.sql`](file:///e:/F1-Championship-Management/database/01_schema.sql).

---

## 1. Before Normalization (Single Wide Table)

In the unnormalized design, all race details, circuit locations, driver identities, team constructors, and race results are bundled into one flat table.

### Table: `UNNORMALIZED_RACE_RESULTS` *(Illustrative)*

| Race_ID | Race_Name | Season | Circuit_Name | Circuit_Country | Driver_ID | Driver_Name | Team_ID | Team_Name | Finishing_Position | Points |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **R01** | Bahrain Grand Prix | 2024 | Bahrain International Circuit | Bahrain | **D01** | Max Verstappen | **T01** | Red Bull Racing | 1 | 26 |
| **R01** | Bahrain Grand Prix | 2024 | Bahrain International Circuit | Bahrain | **D02** | Sergio Perez | **T01** | Red Bull Racing | 2 | 18 |
| **R01** | Bahrain Grand Prix | 2024 | Bahrain International Circuit | Bahrain | **D03** | Carlos Sainz | **T02** | Scuderia Ferrari | 3 | 15 |
| **R02** | Saudi Arabian Grand Prix | 2024 | Jeddah Corniche Circuit | Saudi Arabia | **D01** | Max Verstappen | **T01** | Red Bull Racing | 1 | 25 |
| **R02** | Saudi Arabian Grand Prix | 2024 | Jeddah Corniche Circuit | Saudi Arabia | **D02** | Sergio Perez | **T01** | Red Bull Racing | 2 | 18 |
| **R02** | Saudi Arabian Grand Prix | 2024 | Jeddah Corniche Circuit | Saudi Arabia | **D04** | Charles Leclerc | **T02** | Scuderia Ferrari | 3 | 15 |

**Redundancies shown above:**
- **Race & Circuit:** `Bahrain Grand Prix`, `Sakhir / Bahrain`, and `2024` repeat for every finishing driver.
- **Team Information:** `Red Bull Racing` and `Scuderia Ferrari` repeat across drivers and races.
- **Driver Information:** `Max Verstappen` and `Sergio Perez` repeat in every Grand Prix entry.

---

## 2. After Normalization (Actual 3NF Project Schema)

The project decomposes the single table into separate, specialized relational entities. Keys strictly follow [`database/01_schema.sql`](file:///e:/F1-Championship-Management/database/01_schema.sql).

---

### 2.1 Table: `COUNTRY`
Geographical lookup table; avoids repeating country names across circuits, teams, and drivers.

- **Primary Key (PK):** `country_id`
- **Columns:** `country_id` [PK], `country_code`, `country_name`

| country_id [PK] | country_code | country_name |
| :--- | :--- | :--- |
| **101** | BHR | Bahrain |
| **102** | SAU | Saudi Arabia |
| **103** | NLD | Netherlands |
| **104** | ITA | Italy |

---

### 2.2 Table: `SEASON`
Championship years and date boundaries.

- **Primary Key (PK):** `season_year`
- **Columns:** `season_year` [PK], `season_name`, `start_date`, `end_date`, `notes`

| season_year [PK] | season_name | start_date | end_date | notes |
| :--- | :--- | :--- | :--- | :--- |
| **2023** | 2023 FIA Formula One World Championship | 2023-03-03 | 2023-11-26 | 22 rounds |
| **2024** | 2024 FIA Formula One World Championship | 2024-02-29 | 2024-12-08 | 24 rounds |

---

### 2.3 Table: `CIRCUIT`
Circuit locations and coordinates.

- **Primary Key (PK):** `circuit_id`
- **Foreign Key (FK):** `country_id` → `COUNTRY(country_id)`
- **Columns:** `circuit_id` [PK], `circuit_ref`, `circuit_name`, `locality`, `country_id` [FK], `latitude`, `longitude`

| circuit_id [PK] | circuit_ref | circuit_name | locality | country_id [FK] | latitude | longitude |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | bahrain | Bahrain International Circuit | Sakhir | **101** | 26.032500 | 50.510600 |
| **2** | jeddah | Jeddah Corniche Circuit | Jeddah | **102** | 21.631900 | 39.104400 |

---

### 2.4 Table: `TEAM`
Formula 1 constructors.

- **Primary Key (PK):** `team_id`
- **Foreign Key (FK):** `country_id` → `COUNTRY(country_id)`
- **Columns:** `team_id` [PK], `constructor_ref`, `team_name`, `nationality`, `country_id` [FK], `primary_color`, `source_system`

| team_id [PK] | constructor_ref | team_name | nationality | country_id [FK] | primary_color | source_system |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | red_bull | Red Bull Racing | Austrian | **105** | #3671C6 | JOLPICA |
| **2** | ferrari | Ferrari | Italian | **104** | #E80020 | JOLPICA |

---

### 2.5 Table: `DRIVER`
Driver identities, race numbers, and nationalities.

- **Primary Key (PK):** `driver_id`
- **Foreign Key (FK):** `country_id` → `COUNTRY(country_id)`
- **Columns:** `driver_id` [PK], `driver_ref`, `driver_code`, `permanent_number`, `first_name`, `last_name`, `date_of_birth`, `nationality`, `country_id` [FK], `source_system`

| driver_id [PK] | driver_ref | driver_code | permanent_number | first_name | last_name | date_of_birth | nationality | country_id [FK] | source_system |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | max_verstappen | VER | 1 | Max | Verstappen | 1997-09-30 | Dutch | **103** | JOLPICA |
| **2** | perez | PER | 11 | Sergio | Perez | 1990-01-26 | Mexican | **107** | JOLPICA |
| **3** | sainz | SAI | 55 | Carlos | Sainz | 1994-09-01 | Spanish | **108** | JOLPICA |
| **4** | leclerc | LEC | 16 | Charles | Leclerc | 1997-10-16 | Monegasque | **106** | JOLPICA |

---

### 2.6 Table: `RACE`
Grand Prix calendar rounds.

- **Primary Key (PK):** `race_id`
- **Foreign Keys (FK):** 
  - `season_year` → `SEASON(season_year)`
  - `circuit_id` → `CIRCUIT(circuit_id)`
- **Columns:** `race_id` [PK], `season_year` [FK], `round_number`, `circuit_id` [FK], `race_name`, `race_date`, `race_time_utc`, `has_sprint`, `source_system`

| race_id [PK] | season_year [FK] | round_number | circuit_id [FK] | race_name | race_date | race_time_utc | has_sprint | source_system |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **2024** | 1 | **1** | Bahrain Grand Prix | 2024-03-02 | 15:00:00Z | N | JOLPICA |
| **2** | **2024** | 2 | **2** | Saudi Arabian Grand Prix | 2024-03-09 | 17:00:00Z | N | JOLPICA |

---

### 2.7 Table: `RACE_RESULT`
Session finishing classifications and championship points scored.

- **Primary Key (PK):** `result_id`
- **Foreign Keys (FK):** 
  - `race_id` → `RACE(race_id)`
  - `driver_id` → `DRIVER(driver_id)`
  - `team_id` → `TEAM(team_id)`
- **Unique Constraint (Alternate Key):** `(race_id, driver_id, session_type)`
- **Columns:** `result_id` [PK], `race_id` [FK], `driver_id` [FK], `team_id` [FK], `session_type`, `grid_position`, `finish_position`, `position_text`, `classification_status`, `points`, `laps_completed`, `source_system`, `is_verified`

| result_id [PK] | race_id [FK] | driver_id [FK] | team_id [FK] | session_type | grid_position | finish_position | classification_status | points |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1001** | **1** | **1** | **1** | RACE | 1 | 1 | Finished | 26 |
| **1002** | **1** | **2** | **1** | RACE | 5 | 2 | Finished | 18 |
| **1003** | **1** | **3** | **2** | RACE | 4 | 3 | Finished | 15 |
| **1004** | **2** | **1** | **1** | RACE | 1 | 1 | Finished | 25 |
| **1005** | **2** | **2** | **1** | RACE | 3 | 2 | Finished | 18 |
| **1006** | **2** | **4** | **2** | RACE | 2 | 3 | Finished | 15 |
