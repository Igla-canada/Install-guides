// IGLA FD — default settings template, transcribed from the official Igla
// configuration software screenshots. This is a STARTING POINT an admin can
// load into the FD product's template (Admin → Igla settings → Load FD
// defaults) and then refine. Option lists are seeded with the values seen in the
// screenshots plus a few obvious siblings; the admin extends them as needed.
//
// Slider convention (matches the software): the number shown under the left "0"
// is the current value; the right number is the max (255).
import type { IglaConfigDoc, IglaOption } from "./igla-config";

const opt = (label: string): IglaOption => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), label });
const opts = (...labels: string[]) => labels.map(opt);

// Shared option lists for the Input/Output wire rows. Directions get explicit
// ids (auto-slugging "Output '-'" / "Output '+'" would collide on punctuation).
const DIRECTIONS: IglaOption[] = [
  { id: "out_minus", label: "Output '-'" },
  { id: "out_plus", label: "Output '+'" },
  { id: "in_plus", label: "Input '+'" },
  { id: "in_minus", label: "Input '-'" },
];
const OUTPUT_FUNCS = opts(
  "Not used",
  "Feature 5",
  "Analog service indication",
  "Siren output",
  "Analog ignition indication"
);
const INPUT_FUNCS = opts("Not used", "Analog ignition", "Alarm input", "Hood pin switch", "Brake pedal");

export const IGLA_FD_DEFAULT: IglaConfigDoc = {
  sections: [
    {
      id: "settings",
      title: "Settings",
      rows: [
        {
          id: "car_configuration",
          label: "Car configuration",
          help: "The vehicle configuration file flashed to the unit.",
          control: {
            type: "select",
            options: opts("toyota_rav4_6r0e2p2"),
            value: "toyota_rav4_6r0e2p2",
          },
        },
        {
          id: "keyfob_range",
          label: "Keyfob range",
          help: "Radio range of the Igla keyfob.",
          control: { type: "slider", min: 0, max: 5, value: 1 },
        },
        {
          id: "low_keyfob_battery_alerts",
          label: "Display alerts about low keyfob battery",
          control: { type: "toggle", value: true, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "analog_indication_control",
          label: "Analog indication control",
          control: {
            type: "select",
            options: opts("ON (in all modes)", "ON (armed only)", "OFF"),
            value: "on_in_all_modes",
          },
        },
        {
          id: "engine_shutoff_by_transmission",
          label: "Engine Shut-off as per the status of the automatic transmission selector",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "engine_shutoff_by_gas_pedal",
          label: "Engine Shut-off upon pressing the gas pedal",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
      ],
    },
    {
      id: "service_mode",
      title: "Service mode",
      rows: [
        {
          id: "service_mode_exit_time",
          label: "Service mode exit time",
          control: {
            type: "select",
            options: opts("5 minutes", "15 minutes", "30 minutes", "60 minutes"),
            value: "15_minutes",
          },
        },
        {
          id: "max_parking_time_service_exit",
          label: "Maximum allowable parking time for automatic exit from Service mode",
          help: "Automatic exit from Service mode after this idle time (HH:MM).",
          control: {
            type: "number",
            unit: "HH:MM",
            segments: [
              { id: "hh", label: "HH", value: "00", max: 23 },
              { id: "mm", label: "MM", value: "05", max: 59 },
            ],
          },
        },
      ],
    },
    {
      id: "security_features",
      title: "Security features",
      rows: [
        {
          id: "alarm_logic",
          label: "Alarm logic",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "detect_keyfob_disarm_standard",
          label: "Detecting a keyfob when disarming via a standard keyfob",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "max_time_detect_keyfob_disarm",
          label: "Maximum time for detecting keyfob when disarming via standard keyfob, sec.",
          control: {
            type: "select",
            options: opts("5 seconds", "10 seconds", "15 seconds", "30 seconds"),
            value: "15_seconds",
          },
        },
        {
          id: "siren_information_signals",
          label: "Siren information signals",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "central_lock_joint_standard",
          label: "Central lock control jointly with standard security system",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "accelerometer",
          label: "Accelerometer",
          control: { type: "toggle", value: true, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "accelerometer_in_alarm_logic",
          label: "Accelerometer processing in alarm logic",
          control: { type: "toggle", value: true, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "motion_sensor_sensitivity",
          label: "Motion sensor sensitivity",
          control: { type: "slider", min: 0, max: 255, value: 127 },
        },
        {
          id: "tilt_sensor_sensitivity",
          label: "Tilt sensor sensitivity",
          control: { type: "slider", min: 0, max: 255, value: 127 },
        },
        {
          id: "light_shock_sensor_sensitivity",
          label: "Light shock sensor sensitivity",
          control: { type: "slider", min: 0, max: 255, value: 175 },
        },
        {
          id: "heavy_shock_sensor_sensitivity",
          label: "Heavy shock sensor sensitivity",
          control: { type: "slider", min: 0, max: 255, value: 75 },
        },
        {
          id: "pulse_duration_siren_info_signal",
          label: "Pulse duration of siren information signal (ms)",
          control: {
            type: "select",
            options: opts("50 milliseconds", "75 milliseconds", "100 milliseconds", "150 milliseconds"),
            value: "75_milliseconds",
          },
        },
        {
          id: "rearming_protection",
          label: 'Protective function against accidental pressing of the "Disarm" button (rearming)',
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "engine_start_inhibit_during_siren",
          label: "Engine Start Inhibit during siren operation time",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
      ],
    },
    {
      id: "extra_features",
      title: "Extra features",
      rows: [
        {
          id: "comfort",
          label: "Comfort",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "fold_mirrors",
          label: "Fold the mirrors",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "ventilation",
          label: "Ventilation",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "start_stop_deactivation",
          label: "START-STOP system deactivation",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "drive_away_locking",
          label: "Drive away locking",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "open_central_lock_by_event",
          label: "Opening of central lock by event",
          control: { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "driver_side_selection",
          label: "Driver side selection",
          control: {
            type: "select",
            options: opts(
              "The driver sits on the left. Left-hand drive",
              "The driver sits on the right. Right-hand drive"
            ),
            value: "the_driver_sits_on_the_left_left_hand_drive",
          },
        },
        {
          id: "discrete_siren_car_search",
          label: "Use discrete siren output to indicate car search",
          control: { type: "toggle", value: true, onLabel: "Enabled", offLabel: "Disabled" },
        },
        {
          id: "hood_pin_switch_source",
          label: "Source of hood pin switch status",
          control: {
            type: "select",
            options: opts("Automatic selection", "Analog input", "CAN bus"),
            value: "automatic_selection",
          },
        },
      ],
    },
    {
      id: "input_output",
      title: "Input/Output",
      rows: [
        {
          id: "io_white_blue",
          label: "White-blue",
          control: {
            type: "io",
            color: "#2f5fce",
            wire: "White-blue",
            direction: { options: DIRECTIONS, value: "out_minus", locked: true },
            inversion: false,
            func: { options: OUTPUT_FUNCS, value: "feature_5" },
          },
        },
        {
          id: "io_white_orange",
          label: "White-orange",
          control: {
            type: "io",
            color: "#e8862a",
            wire: "White-orange",
            direction: { options: DIRECTIONS, value: "out_minus", locked: true },
            inversion: false,
            func: { options: OUTPUT_FUNCS, value: "analog_service_indication" },
          },
        },
        {
          id: "io_white_violet",
          label: "White-violet",
          control: {
            type: "io",
            color: "#6b4c9a",
            wire: "White-violet",
            direction: { options: DIRECTIONS, value: "out_minus", locked: true },
            inversion: false,
            func: { options: OUTPUT_FUNCS, value: "siren_output" },
          },
        },
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
            direction: { options: DIRECTIONS, value: "in_minus", locked: false },
            inversion: false,
            func: { options: INPUT_FUNCS, value: "alarm_input" },
          },
        },
      ],
    },
  ],
};
