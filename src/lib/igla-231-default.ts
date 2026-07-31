// IGLA 231 — default settings template, transcribed from the official Igla
// configuration software (screen recording "231 New flasher"). Exact on-screen
// wording is kept (including typos such as "Input/Ouptut"). Load via Admin →
// Igla settings → Load IGLA 231 defaults.
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
  "Output to additional blocking in the Engine Shut-off mode (NC)",
  "Output to auxiliary blocking in Engine Start Inhibit and Engine Shut-off mode",
  "Output to auxiliary blocking in the Engine Start Inhibit mode (NC)",
  "Output to additional blocking in the Engine Shut-off and Start Inhibit mode",
  "Output to auxiliary blocking of the Start/Stop button",
  "Analog service indication",
  "Hazard warning lights (or some other external indication)",
  "Alternate hazard warning light control",
  "Analog lock",
  "Analog unlock",
  "Alternate central lock control (pulse, along one wire)",
  "Authorization status",
  "Feature 1",
  "Feature 2",
  "Feature 3",
  "Feature 4",
  "Feature 5",
  "Test signal to check device functionality and output",
  // Exact truncated label shown as the Blue wire's selected value
  "Output to additional blocking in the Engine Shut-of",
);

const LIN_FUNCS = opts("LIN", "Not available");

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

const SIREN_DELAY = opts(
  "Disabled",
  "10 sec",
  "20 sec",
  "30 sec",
  "40 sec",
  "50 sec",
  "1 min",
  "1 min 30 sec",
  "2 min",
  "2 min 30 sec",
  "3 min",
  "3 min 30 sec",
  "4 min",
  "4 min 30 sec",
  "5 min",
  "5 min 30 sec",
  "6 min",
  "6 min 30 sec",
  "7 min",
  "7 min 30 sec",
  "8 min",
  "8 min 30 sec",
  "9 min",
  "9 min 30 sec",
  "10 min",
);

const SIREN_OPERATING = opts("1 min", "2 min", "3 min", "5 min", "10 min");

const EXTRA_OPTION_BITS = opts("1", "2", "3", "4", "5", "6", "7", "8");

export const IGLA_231_DEFAULT: IglaConfigDoc = {
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
      id: "settings",
      title: "Settings",
      rows: [
        {
          id: "anti_carjacking_safety_distance",
          label: "Anti-carjacking safety distance",
          control: { type: "slider", min: 100, max: 2000, value: 300 },
        },
        {
          id: "conditions_entering_armed_mode",
          label: "Conditions for entering the Armed mode",
          control: {
            type: "select",
            options: opts(
              "After the ignition is turned off and timeout has elapsed",
              "After turning off the ignition and opening the driver's door",
              "After the ignition is turned off and the car perimeter is armed",
            ),
            value: "after_the_ignition_is_turned_off_and_timeout_has_elapsed",
          },
        },
        {
          id: "timeout_transition_armed_mode",
          label: "Timeout for device transition to the Armed mode",
          control: {
            type: "number",
            unit: "MM:SS",
            segments: [
              { id: "mm", value: "00", max: 59 },
              { id: "ss", value: "03", max: 59 },
            ],
          },
        },
      ],
    },
    {
      id: "service_features",
      title: "Service features",
      rows: [
        {
          id: "car_driving_period_service_exit",
          label: "Car driving period for automatic exit from Service mode",
          control: {
            type: "select",
            options: DRIVING_PERIOD,
            value: "15_minutes",
          },
        },
        {
          id: "service_mode_reset_timer_at_stop",
          label: "Service mode reset timer at stop",
          control: {
            type: "number",
            unit: "MM:SS",
            segments: [
              { id: "mm", value: "00", max: 59 },
              { id: "ss", value: "05", max: 59 },
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
          id: "hood_pin_switch_source",
          label: "Source of hood pin switch status",
          control: {
            type: "select",
            options: opts(
              "Automatic selection",
              "Digital buses",
              "Discrete input (analog pin switch)",
            ),
            value: "automatic_selection",
          },
        },
      ],
    },
    {
      id: "anti_theft_features",
      title: "Anti-theft features",
      rows: [
        {
          id: "engine_start_block",
          label: "Engine start block",
          control: {
            type: "select",
            options: opts("Engine Shut-off", "Engine Start Inhibit"),
            value: "engine_start_inhibit",
          },
        },
        {
          id: "esi_after_shutoff",
          label:
            "Engine Start Inhibit is enabled after Engine Shut-off is triggered",
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
          id: "extra_options",
          label: "Extra options",
          control: {
            type: "flags",
            options: EXTRA_OPTION_BITS,
            values: [],
          },
        },
        {
          id: "anti_carjacking_mode",
          label: "Anti-carjacking mode",
          control: {
            type: "select",
            options: opts(
              "Anti-carjacking mode ?",
              "Disabled",
              "Super Anti-carjacking mode ?",
            ),
            value: "disabled",
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
          id: "digital_start_inhibit",
          label: "Digital Start Inhibit",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "digital_engine_blocking",
          label: "Digital engine blocking",
          control: {
            type: "toggle",
            value: true,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "blocking_standard_autostart",
          label: "Blocking of standard autostart",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
      ],
    },
    {
      id: "authorization",
      title: "Authorization",
      rows: [
        {
          id: "authorization_mode",
          label: "Authorization mode",
          control: {
            type: "select",
            options: opts(
              "Multi-authorization ?",
              "Step-by-step authorization ?",
              "Two-factor authorization ?",
            ),
            value: "multi_authorization",
          },
        },
        {
          id: "smartphone_pairing_mode",
          label: "Smartphone pairing mode",
          control: {
            type: "select",
            options: opts(
              "Classic mode ?",
              "Multi-authorization ?",
              "Step-by-step authorization ?",
              "Two-factor authorization ?",
            ),
            value: "classic_mode",
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
          id: "anti_tamper",
          label: "Anti-Tamper",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "delay_before_siren_activation",
          label: "Delay before siren activation",
          control: {
            type: "select",
            options: SIREN_DELAY,
            value: "30_sec",
          },
        },
        {
          id: "siren_operating_time",
          label: "Siren operating time",
          control: {
            type: "select",
            options: SIREN_OPERATING,
            value: "5_min",
          },
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
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
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
          control: { type: "slider", min: 0, max: 250, value: 77 },
        },
        {
          id: "speed_reduction_range",
          label: "Speed reduction range to reset speeding warning (km/h)",
          control: { type: "slider", min: 0, max: 250, value: 3 },
        },
        {
          id: "control_start_stop_system",
          label: "Control of START-STOP system",
          control: {
            type: "toggle",
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
        },
        {
          id: "driver_side_selection",
          label: "Driver side selection",
          control: {
            type: "select",
            options: opts(
              "The driver sits on the left. Left-hand drive",
              "The driver sits on the right. Right-hand drive",
            ),
            value: "the_driver_sits_on_the_left_left_hand_drive",
          },
        },
      ],
    },
    {
      id: "keyfobs_and_smartphones",
      title: "Keyfobs and smartphones",
      rows: [
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
            value: false,
            onLabel: "Enabled",
            offLabel: "Disabled",
          },
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
              value: "output_to_additional_blocking_in_the_engine_shut_of",
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
            func: { options: OUTPUT_FUNCS, value: "analog_service_indication" },
          },
        },
        {
          id: "io_white_red",
          label: "White-red",
          control: {
            type: "io",
            color: "#c43c3c",
            wire: "White-red",
            direction: { options: DIRECTIONS, value: "lin", locked: true },
            inversion: false,
            func: { options: LIN_FUNCS, value: "lin" },
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
            segments: [{ id: "v", value: "113" }],
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
      ],
    },
  ],
};
