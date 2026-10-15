#pragma once

#include <Arduino.h>

struct SensorLogPayload {
    const char* sonde_id;
    const char* location_name;

    float temperature;
    float dissolved_oxygen;
    float ph;
    float turbidity;
    float water_depth;

    bool        is_anomaly;
    const char* anomaly_source;
    int         confidence_level;

    float std_dev_do;
    float std_dev_temp;
    float std_dev_ph;
    float std_dev_turbidity;
    float std_dev_depth;

    const char* sensor_fault;
};

void supabase_init();

bool supabase_sendSensorLog(const SensorLogPayload& p);
