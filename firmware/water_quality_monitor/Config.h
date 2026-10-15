#pragma once

#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

#define SUPABASE_URL        "https://YOUR_PROJECT.supabase.co"
#define SUPABASE_API_KEY    "YOUR_SUPABASE_ANON_KEY"

#define SONDE_ID        "device_12"
#define LOCATION_NAME   "Pine Lake"

#define UPLOAD_INTERVAL_MS  10000UL

// Dissolved oxygen: analog galvanic probe on ADS1115 A0.
#define DO_ADS_CHANNEL      0
#define DO_DIVIDER_RATIO    1.5f    // set to 1.0 if A0 has no 10k/20k divider
#define DO_TWO_POINT_CAL    0       // 1 = use both calibration points below
#define DO_CAL1_MV          1600.0f // probe output in saturated water at DO_CAL1_TEMP_C
#define DO_CAL1_TEMP_C      25.0f
#define DO_CAL2_MV          1300.0f // only used if DO_TWO_POINT_CAL = 1
#define DO_CAL2_TEMP_C      15.0f

// Depth: submersible pressure transducer read on an ESP32 ADC1 pin.
// ADC2 pins stop working once WiFi is on, so this must be GPIO 32-39.
#define DEPTH_ADC_PIN       34
#define DEPTH_DIVIDER_RATIO 1.0f
#define DEPTH_ZERO_MV       480.0f  // output with the probe in air
#define DEPTH_FULL_MV       2400.0f // output at full scale
#define DEPTH_RANGE_M       5.0f    // full-scale depth of the transducer
#define DEPTH_SAMPLES       32

// 1 = print raw DO/depth millivolts each reading, for calibrating the values above
#define SENSOR_CAL_DEBUG    0

// Flatline (stuck-sensor) check, run on raw sensor voltages before
// calibration, clamping, or Kalman filtering.
// Window of 90 readings = 15 min at a 10 s interval.
#define FLAT_WINDOW            90
// Thresholds are std devs of the raw signal (volts) over the window.
// One ADS1115 count at GAIN_ONE behind the 10k/20k divider is ~0.19 mV;
// a live analog probe should wander more than that. Calibrate these
// against a known-good sensor with FLATLINE_DEBUG on.
#define FLAT_THRESH_PH_V       0.0002f
#define FLAT_THRESH_TURB_V     0.0002f
#define FLAT_THRESH_DO_V       0.0002f
#define FLAT_THRESH_DEPTH_V    0.0003f
#define FLATLINE_DEBUG         0   // 1 = print each channel's window std dev
#define FLATLINE_UPLOAD        0   // 1 = send sensor_fault to Supabase (needs a text column "sensor_fault")
