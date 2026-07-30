// IGLA Alarm OLD — default settings template, transcribed from the official
// Igla configuration software (screen recording "OLD ALARM"). Exact on-screen
// wording is kept (including typos such as "Input/Ouptut" and
// "Authorization via standard keyfobfob"). Load via Admin → Igla settings →
// Load IGLA Alarm OLD defaults.
import type { IglaConfigDoc, IglaOption } from "./igla-config";

const opt = (label: string): IglaOption => ({
  id: label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, ""),
  label,
});
const opts = (...labels: string[]) => labels.map(opt);

const DIRECTIONS: IglaOption[] = [
  { id: "in_plus", label: "Input '+'" },
  { id: "in_minus", label: "Input '-'" },
  { id: "out_minus", label: "Output '-'" },
  { id: "lin", label: "LIN" },
];

const INPUT_FUNCS = opts(
  "Not available",
  "Analog ignition",
  "Alarm input",
  "Hood switch",
  "Feature 1",
  "Feature 2",
  "Feature 3",
  "Feature 4",
  "Feature 5",
);

const OUTPUT_FUNCS = opts(
  "Not available",
  "Output to additional blocking (NC)",
  "Output to additional blocking (NO)",
  "Analog service indication",
  "Hazard warning lights (or some other external indication)",
  "Alternate hazard warning light control",
  "Analog lock",
  "Analog unlock",
  "Alternate central lock control (pulse, along one wire)",
  "Siren output",
  "Horn output",
  "Authorization status",
  "Feature 1",
  "Feature 2",
  "Feature 3",
  "Feature 4",
  "Feature 5",
  "Test signal to check device functionality and output",
);

const DRIVING_PERIOD = opts(
  "1 minute",
  "1 minute 30 seconds",
  "2 minutes",
  "2 minutes 30 seconds",
  "3 minutes",
  "4 minutes",
  "5 minutes",
  "6 minutes",
  "7 minutes",
  "8 minutes",
  "9 minutes",
  "10 minutes",
  "15 minutes",
  "20 minutes",
  "30 minutes",
  "60 minutes",
);

const KEYFOB_DETECT_TIME = opts(
  "0 seconds",
  "5 seconds",
  "10 seconds",
  "15 seconds",
  "20 seconds",
  "25 seconds",
);

const EXTRA_OPTION_BITS = opts("1", "2", "3", "4", "5", "6", "7", "8");

export const IGLA_ALARM_OLD_DEFAULT: IglaConfigDoc = {
  sections: [
    {
      id: "service_mode_top",
      title: "Service mode",
      rows: [
        {
          id: "service_mode",
          label: "Service mode",
          control: {
            type: "select",
            options: opts("Disabled", "Enabled"),
            value: "disabled",
          },
        },
      ],
    },
    {
      id: "general_settings",
      title: "General settings",
      rows: [
        {
          id: "fold_the_mirrors",
          label: "Fold the mirrors",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "comfort",
          label: "Comfort",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "ventilation",
          label: "Ventilation",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "drive_away_locking",
          label: "Drive away locking",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "opening_central_lock_by_event",
          label: "Opening of central lock by event",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "engine_start_block",
          label: "Engine start block",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "anti_carjacking_mode",
          label: "Anti-carjacking mode",
          control: {
            type: "select",
            options: opts(
              "Anti-carjacking mode",
              "Disabled",
              "Super Anti-carjacking mode",
            ),
            value: "super_anti_carjacking_mode",
          },
        },
        {
          id: "anti_carjacking_safety_distance",
          label: "Anti-carjacking safety distance",
          control: { type: "slider", min: 100, max: 2000, value: 300 },
        },
        {
          id: "extra_options",
          label: "Extra options",
          control: {
            type: "select",
            options: EXTRA_OPTION_BITS,
            value: null,
          },
        },
        {
          id: "car_driving_period_service_exit",
          label: "Car driving period for automatic exit from Service mode",
          control: {
            type: "select",
            options: DRIVING_PERIOD,
            value: "30_minutes",
          },
        },
        {
          id: "max_parking_time_service_exit",
          label:
            "Maximum allowable parking time for automatic exit from Service mode",
          control: {
            type: "number",
            unit: "MM:SS",
            segments: [
              { id: "mm", value: "00", max: 59 },
              { id: "ss", value: "05", max: 59 },
            ],
          },
        },
        {
          id: "alarm_logic",
          label: "Alarm logic",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "additional_blocking_immobilizer",
          label: "Additional blocking of the standard immobilizer",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "digital_blocking_automatic_gearbox",
          label: "Digital blocking of the automatic gearbox",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "smartphone_pairing_mode",
          label: "Smartphone pairing mode",
          control: {
            type: "select",
            options: opts("HID mode", "Classic mode"),
            value: "classic_mode",
          },
        },
        {
          id: "keyfob_range",
          label: "Keyfob range",
          control: { type: "slider", min: 0, max: 4, value: 4 },
        },
        {
          id: "low_keyfob_battery_alerts",
          label: "Display alerts about low keyfob battery",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "start_stop_system_deactivation",
          label: "START-STOP system deactivation",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "authorization_mode",
          label: "Authorization mode",
          control: {
            type: "select",
            options: opts(
              "Multi-authorization",
              "Step-by-step authorization",
              "Two-factor authorization",
              // Exact UI typo
              "Authorization via standard keyfobfob",
            ),
            value: "authorization_via_standard_keyfobfob",
          },
        },
        {
          id: "speeding_warning",
          label: "Speeding warning",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "speeding_threshold",
          label: "Speeding threshold (km/h)",
          control: {
            type: "number",
            segments: [{ id: "v", value: "77" }],
          },
        },
        {
          id: "speed_reduction_range",
          label: "Speed reduction range to reset speeding warning (km/h)",
          control: {
            type: "number",
            segments: [{ id: "v", value: "3" }],
          },
        },
        {
          id: "hands_free",
          label: "Hands Free (central lock control via keyfob)",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "enable_start_inhibit_after_shutoff",
          label: "Enable start inhibit after engine shut-off",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "detect_keyfob_disarm_standard",
          label: "Detecting a keyfob when disarming via a standard keyfob",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "max_time_detect_keyfob_disarm",
          label:
            "Maximum time for detecting keyfob when disarming via standard keyfob, sec.",
          control: {
            type: "select",
            options: KEYFOB_DETECT_TIME,
            value: "10_seconds",
          },
        },
        {
          id: "vehicle_diagnostic_prohibition",
          label: "Vehicle diagnostic prohibition",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "digital_indication",
          label: "Digital indication",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "siren_information_signals",
          label: "Siren information signals",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "pulse_duration_siren_info_signal",
          label: "Pulse duration of siren information signal (ms)",
          control: { type: "slider", min: 5, max: 1000, value: 60 },
        },
        {
          id: "hood_pin_switch_source",
          label: "Source of hood pin switch status",
          control: {
            type: "select",
            options: opts(
              "Automatic selection",
              "Digital buses",
              "Discrete input (analog pin switch)",
              "BLE siren",
            ),
            value: "automatic_selection",
          },
        },
        {
          id: "accelerometer",
          label: "Accelerometer",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "motion_sensor_sensitivity",
          label: "Motion sensor sensitivity",
          control: { type: "slider", min: 0, max: 255, value: 100 },
        },
        {
          id: "tilt_sensor_sensitivity",
          label: "Tilt sensor sensitivity",
          control: { type: "slider", min: 0, max: 255, value: 100 },
        },
        {
          id: "light_shock_sensor_sensitivity",
          label: "Light shock sensor sensitivity",
          control: { type: "slider", min: 0, max: 255, value: 100 },
        },
        {
          id: "heavy_shock_sensor_sensitivity",
          label: "Heavy shock sensor sensitivity",
          control: { type: "slider", min: 0, max: 255, value: 50 },
        },
      ],
    },
    {
      // Exact spelling from the software UI
      id: "input_ouptut",
      title: "Input/Ouptut",
      rows: [
        {
          id: "io_yellow",
          label: "Yellow",
          control: {
            type: "io",
            color: "#f2c200",
            wire: "Yellow",
            direction: { options: DIRECTIONS, value: "in_plus", locked: true },
            inversion: false,
            func: { options: INPUT_FUNCS, value: "analog_ignition" },
          },
        },
        {
          id: "io_violet",
          label: "Violet",
          control: {
            type: "io",
            color: "#6b4c9a",
            wire: "Violet",
            direction: {
              options: DIRECTIONS,
              value: "in_minus",
              locked: false,
            },
            inversion: false,
            func: { options: INPUT_FUNCS, value: "alarm_input" },
          },
        },
        {
          id: "io_blue",
          label: "Blue",
          control: {
            type: "io",
            color: "#2f5fce",
            wire: "Blue",
            direction: { options: DIRECTIONS, value: "out_minus", locked: true },
            inversion: false,
            func: {
              options: OUTPUT_FUNCS,
              value: "output_to_additional_blocking_nc",
            },
          },
        },
        {
          id: "io_orange",
          label: "Orange",
          control: {
            type: "io",
            color: "#e8862a",
            wire: "Orange",
            direction: { options: DIRECTIONS, value: "out_minus", locked: true },
            inversion: false,
            func: { options: OUTPUT_FUNCS, value: "siren_output" },
          },
        },
        {
          id: "io_white_red",
          label: "White-red",
          control: {
            type: "io",
            color: "#c43c3c",
            wire: "White-red",
            direction: {
              options: DIRECTIONS,
              value: "out_minus",
              locked: false,
            },
            inversion: false,
            func: { options: OUTPUT_FUNCS, value: "feature_1" },
          },
        },
        {
          id: "io_orange_black",
          label: "Orange-black",
          control: {
            type: "io",
            color: "#3a3a3a",
            wire: "Orange-black",
            direction: {
              options: DIRECTIONS,
              value: "out_minus",
              locked: false,
            },
            inversion: false,
            func: { options: OUTPUT_FUNCS, value: "analog_service_indication" },
          },
        },
      ],
    },
    {
      id: "system_settings",
      title: "System settings",
      rows: [
        {
          id: "settings_structure_version",
          label: "Settings structure version",
          control: {
            type: "number",
            segments: [{ id: "v", value: "3" }],
          },
        },
        {
          id: "structure_preamble",
          label: "Structure preamble",
          control: {
            type: "number",
            segments: [{ id: "v", value: "0xAABBCCDD" }],
          },
        },
        {
          id: "structure_revision",
          label: "Structure revision",
          control: {
            type: "number",
            segments: [{ id: "v", value: "3" }],
          },
        },
        {
          id: "memory_size_for_firmware",
          label: "Memory size for firmware",
          control: {
            type: "number",
            segments: [{ id: "v", value: "112" }],
          },
        },
        {
          id: "minimal_supported_flasher_version",
          label: "Minimal supported Flasher version",
          control: {
            type: "number",
            segments: [{ id: "v", value: "4.7" }],
          },
        },
        {
          id: "nrf_minimal_supported_version",
          label: "NRF minimal supported version",
          control: {
            type: "number",
            segments: [{ id: "v", value: "1.0" }],
          },
        },
        {
          id: "device_type_code",
          label: "Device type code",
          control: {
            type: "number",
            segments: [{ id: "v", value: "46" }],
          },
        },
        {
          id: "service_flags",
          label: "Service flags",
          control: {
            type: "number",
            segments: [{ id: "v", value: "00000000" }],
          },
        },
        {
          id: "descriptor_id",
          label: "Descriptor ID",
          control: {
            type: "number",
            segments: [{ id: "v", value: "00010700" }],
          },
        },
        {
          id: "immobilizer_lock_by_default",
          label: "Immobilizer lock by default",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
      ],
    },
  ],
};
