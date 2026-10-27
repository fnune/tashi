import type {
  BasalInsulinId,
  BolusInsulinId,
  GlucoseUnit,
  Profile,
  Settings,
} from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import { sql } from "kysely";
import { profileIdOfUuid, profileUuid } from "../../domain/builtin-profiles.js";
import type { IdGenerator } from "../../domain/ids.js";
import type { SettingsRepository } from "../../domain/repositories.js";
import { settingsSchema } from "../../domain/schemas.js";
import { StoredDataError } from "../stored-data-error.js";
import type { Db, Executor } from "./connection.js";
import { fromMgDl, toMgDl } from "./glucose-units.js";

export async function readSettings(db: Executor): Promise<Settings> {
  const row = await db.selectFrom("settings").selectAll().executeTakeFirst();
  if (!row) return structuredClone(DEFAULT_SETTINGS);

  const windows = await db
    .selectFrom("meal_windows")
    .selectAll()
    .orderBy("position")
    .execute();
  const profiles = await db
    .selectFrom("profiles")
    .selectAll()
    .orderBy("position")
    .execute();
  const ratios = await db.selectFrom("profile_window_ratios").selectAll().execute();
  const windowNames = new Map(windows.map((w) => [w.id, w.name]));
  const unit: GlucoseUnit = row.glucose_unit;

  const candidate = {
    meal_windows: windows.map((w) => ({
      name: w.name,
      start_hour: w.start_hour,
      end_hour: w.end_hour,
      ratio: w.carbs_g_per_unit,
    })),
    correction_factor:
      row.glucose_drop_mg_dl_per_unit === null
        ? null
        : fromMgDl(row.glucose_drop_mg_dl_per_unit, unit),
    target_blood_sugar: fromMgDl(row.target_glucose_mg_dl, unit),
    glucose_unit: unit,
    ratio_format: row.ratio_format,
    pen_increment: row.pen_increment_units,
    fat_protein_multiplier: row.fat_protein_multiplier,
    bolus_insulin_id: row.bolus_insulin,
    basal_insulin_id: row.basal_insulin,
    insulin_action_minutes: row.insulin_action_minutes,
    language: row.language,
    profiles: profiles.map((p) => ({
      id: profileIdOfUuid(p.id),
      name: p.name ?? "",
      emoji: p.icon,
      adjustment:
        p.adjustment_mode === "percent"
          ? { mode: "percent", percent: p.percent_adjustment }
          : {
              mode: "per_window",
              ratios: Object.fromEntries(
                ratios
                  .filter((r) => r.profile_id === p.id)
                  .map((r) => [
                    windowNames.get(r.window_id) ?? r.window_id,
                    r.carbs_g_per_unit,
                  ]),
              ),
            },
    })),
    active_profile_id: profileIdOfUuid(row.active_profile_id),
    cycle: {
      enabled: row.cycle_tracking_enabled,
      last_period_start: row.last_period_start,
      length_days: row.cycle_length_days,
    },
  };
  try {
    return settingsSchema.parse(candidate);
  } catch (e) {
    throw new StoredDataError("settings", e);
  }
}

export class PostgresSettingsRepository implements SettingsRepository {
  constructor(
    private db: Db,
    private newId: IdGenerator,
  ) {}

  get(): Promise<Settings> {
    return readSettings(this.db);
  }

  async save(settings: Settings): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`SET CONSTRAINTS ALL DEFERRED`.execute(trx);
      const unit = settings.glucose_unit;
      const stored = await trx
        .selectFrom("settings")
        .select([
          "glucose_unit",
          "target_glucose_mg_dl",
          "glucose_drop_mg_dl_per_unit",
        ])
        .executeTakeFirst();
      const onlyTheUnitChanged =
        stored !== undefined &&
        stored.glucose_unit !== unit &&
        sameNumber(
          settings.target_blood_sugar,
          fromMgDl(stored.target_glucose_mg_dl, stored.glucose_unit),
        ) &&
        (settings.correction_factor === null
          ? stored.glucose_drop_mg_dl_per_unit === null
          : stored.glucose_drop_mg_dl_per_unit !== null &&
            sameNumber(
              settings.correction_factor,
              fromMgDl(stored.glucose_drop_mg_dl_per_unit, stored.glucose_unit),
            ));

      const existingWindows = await trx
        .selectFrom("meal_windows")
        .select(["id", "name"])
        .execute();
      const windowIds = new Map(existingWindows.map((w) => [w.name, w.id]));
      for (const [position, window] of settings.meal_windows.entries()) {
        const id = windowIds.get(window.name) ?? this.newId();
        windowIds.set(window.name, id);
        const columns = {
          position,
          name: window.name,
          start_hour: window.start_hour,
          end_hour: window.end_hour,
          carbs_g_per_unit: window.ratio,
        };
        await trx
          .insertInto("meal_windows")
          .values({ id, ...columns })
          .onConflict((oc) => oc.column("id").doUpdateSet(columns))
          .execute();
      }

      for (const [position, profile] of settings.profiles.entries()) {
        const id = profileUuid(profile.id);
        const columns = profileColumns(profile, position);
        await trx
          .insertInto("profiles")
          .values({ id, ...columns })
          .onConflict((oc) => oc.column("id").doUpdateSet(columns))
          .execute();
        await trx
          .deleteFrom("profile_window_ratios")
          .where("profile_id", "=", id)
          .execute();
        if (profile.adjustment.mode === "per_window") {
          for (const [windowName, ratio] of Object.entries(
            profile.adjustment.ratios,
          )) {
            const windowId = windowIds.get(windowName);
            if (!windowId) continue;
            await trx
              .insertInto("profile_window_ratios")
              .values({
                profile_id: id,
                window_id: windowId,
                carbs_g_per_unit: ratio,
              })
              .execute();
          }
        }
      }

      const columns = {
        language: settings.language,
        glucose_unit: unit,
        ratio_format: settings.ratio_format,
        pen_increment_units: settings.pen_increment,
        target_glucose_mg_dl:
          onlyTheUnitChanged && stored
            ? stored.target_glucose_mg_dl
            : toMgDl(settings.target_blood_sugar, unit),
        glucose_drop_mg_dl_per_unit:
          onlyTheUnitChanged && stored
            ? stored.glucose_drop_mg_dl_per_unit
            : settings.correction_factor === null
              ? null
              : toMgDl(settings.correction_factor, unit),
        fat_protein_multiplier: settings.fat_protein_multiplier,
        bolus_insulin: settings.bolus_insulin_id satisfies BolusInsulinId | null,
        basal_insulin: settings.basal_insulin_id satisfies BasalInsulinId | null,
        insulin_action_minutes: settings.insulin_action_minutes,
        cycle_tracking_enabled: settings.cycle.enabled,
        cycle_length_days: settings.cycle.length_days,
        last_period_start: settings.cycle.last_period_start,
        active_profile_id: profileUuid(settings.active_profile_id),
      };
      await trx
        .insertInto("settings")
        .values({ singleton: true, ...columns })
        .onConflict((oc) => oc.column("singleton").doUpdateSet(columns))
        .execute();

      const keptProfiles = settings.profiles.map((p) => profileUuid(p.id));
      await trx
        .deleteFrom("profiles")
        .where((eb) =>
          keptProfiles.length === 0
            ? eb.val(true)
            : eb("id", "not in", keptProfiles),
        )
        .execute();
      const keptWindows = settings.meal_windows.map((w) => w.name);
      await trx
        .deleteFrom("meal_windows")
        .where((eb) =>
          keptWindows.length === 0
            ? eb.val(true)
            : eb("name", "not in", keptWindows),
        )
        .execute();
    });
  }
}

function profileColumns(profile: Profile, position: number) {
  return {
    position,
    name: profile.name === "" ? null : profile.name,
    icon: profile.emoji,
    adjustment_mode: profile.adjustment.mode,
    percent_adjustment:
      profile.adjustment.mode === "percent" ? profile.adjustment.percent : null,
  };
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}
