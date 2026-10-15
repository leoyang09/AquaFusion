// Native test for FlatlineDetector.h:  g++ -std=c++17 -O2 flatline_test.cpp -o flatline_test && ./flatline_test
#include "../water_quality_monitor/FlatlineDetector.h"
#include <cstdio>
#include <fstream>
#include <random>
#include <sstream>
#include <string>
#include <vector>

static const int   W   = 90;
static const float THR = 0.0002f;           // FLAT_THRESH_PH_V in Config.h
static const float LSB = 0.000125f * 1.5f;  // one ADS1115 count (GAIN_ONE) behind the 10k/20k divider
static int failures = 0;

static void check(const char* name, bool got, bool want) {
    printf("%-58s %s\n", name, got == want ? "PASS" : "FAIL");
    if (got != want) failures++;
}

int main() {
    std::mt19937 rng(42);

    {   // 1. A constant signal (stuck amplifier) is flagged once the window fills.
        FlatlineDetector<W> d;
        for (int i = 0; i < W - 1; i++) d.update(2.875f);
        check("constant signal: not judged before window is full", d.isFlat(THR), false);
        d.update(2.875f);
        check("constant signal: flagged when window is full", d.isFlat(THR), true);
    }
    {   // 2. A live sensor in still water: steady level plus a few ADC counts of noise.
        FlatlineDetector<W> d;
        std::normal_distribution<float> n(0.0f, 3.0f * LSB);
        for (int i = 0; i < W; i++) d.update(1.90f + n(rng));
        check("steady water + 3-count ADC noise: not flagged", d.isFlat(THR), false);
    }
    {   // 3. Healthy for a long time, then the sensor freezes.
        FlatlineDetector<W> d;
        std::normal_distribution<float> n(0.0f, 0.01f);
        for (int i = 0; i < 1000; i++) d.update(2.5f + n(rng));
        check("1000 healthy readings: not flagged", d.isFlat(THR), false);
        int flaggedAfter = -1;
        for (int i = 1; i <= 2 * W; i++) {
            d.update(2.875f);
            if (flaggedAfter < 0 && d.isFlat(THR)) flaggedAfter = i;
        }
        printf("    -> flagged %d readings after freezing (window = %d)\n", flaggedAfter, W);
        check("healthy then frozen: flagged within one window", flaggedAfter > 0 && flaggedAfter <= W, true);
    }
    {   // 4. Replay the real bench test. pH (logged, filtered) is converted back to
        //    board volts with the firmware's calibration: V = (21.34 - pH) / 5.70.
        std::ifstream f("bench_milk_test_2026-09-26.csv");
        std::string line; std::getline(f, line);
        std::vector<std::string> head; { std::stringstream ss(line); std::string c; while (std::getline(ss, c, ',')) head.push_back(c); }
        int iph = -1; for (size_t i = 0; i < head.size(); i++) if (head[i] == "ph") iph = (int)i;
        FlatlineDetector<91> d; int rows = 0; float v0 = 0;
        while (std::getline(f, line)) {
            std::stringstream ss(line); std::string c; std::vector<std::string> cols;
            while (std::getline(ss, c, ',')) cols.push_back(c);
            float v = (21.34f - std::stof(cols[iph])) / 5.70f;
            if (!rows) v0 = v;
            d.update(v); rows++;
        }
        printf("    -> %d logged readings, pH board voltage %.3f V, window std %.6f V\n", rows, v0, d.stddev());
        check("logged bench test: frozen pH channel flagged", d.isFlat(THR), true);
    }
    printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "ALL PASSED", failures, failures == 1 ? "" : "s");
    return failures ? 1 : 0;
}
