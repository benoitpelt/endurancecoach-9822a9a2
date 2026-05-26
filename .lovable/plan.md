# Distinguer réalisé vs prévu dans "Explique ma semaine"

## Objectif
Le briefing hebdomadaire doit analyser les jours passés à partir des séances **réellement faites** (Strava via `completed_workouts`) et non du plan théorique, tout en conservant le plan pour les jours à venir.

## Changements

### 1. `src/components/CoachIAFloating.tsx`
Avant de déclencher le briefing (dans le `useEffect` qui consomme `pendingBriefing`), charger la semaine courante :

- Calculer `weekStart` (lundi) et `weekEnd` (dimanche) côté client.
- Requête `completed_workouts` filtrée :
  - `user_id = user.id`
  - `start_date` entre `weekStart` et `weekEnd`
  - `matching_status != 'unmatched'`
  - Champs : `sport_type, start_date, duration_seconds, moving_time_seconds, conformity_status, planned_workout_id, imported_activity_id`
- Requête `planned_workouts` filtrée sur la même fenêtre, `scheduled_date >= aujourd'hui`, champs utiles (sport, date, goal, target_summary_label, duration_target_minutes, structure_text).
- Formater deux blocs texte lisibles :
  - `seances_realisees` : une ligne par séance (date jour de semaine, sport, durée réelle en minutes, conformity_status).
  - `seances_prevues` : une ligne par séance (date, sport, objectif, durée cible).
  - Si vide : `"Aucune séance"`.
- Passer ces deux blocs au prompt caché du briefing en remplaçant la section actuelle "jours passés/à venir" par le texte demandé :

  ```
  RÉALISÉ cette semaine (jours passés) :
  {{seances_realisees}}
  — Source : activités Strava réelles via completed_workouts

  PRÉVU (aujourd'hui et jours restants) :
  {{seances_prevues}}
  — Source : planned_workouts

  Pour les jours passés, base ton analyse uniquement sur ce qui a été réellement fait …
  ```

Le reste du prompt (objectif semaine, ordre, séance clé, TSB, conseil, ton coach, 200 mots max) est conservé.

### Notes techniques
- Tout est fait côté client (pas de modif edge function nécessaire) : on injecte les blocs dans le `prompt` texte envoyé via `runMessage(..., { hidden: true })`.
- Pas de modif du contexte global (`context`) — c'est spécifique au briefing.
- Aucun changement de schéma BDD.
