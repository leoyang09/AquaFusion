#pragma once

#include <Arduino.h>
#include <math.h>

#define AE_INPUT_SIZE      5
#define AE_HIDDEN_SIZE     3
#define AE_BOTTLENECK_SIZE 2

#define AE_LEARNING_RATE   0.01f
#define AE_TRAIN_EPOCHS    5
#define AE_WARMUP_SAMPLES  50

class Autoencoder {
public:
    Autoencoder();

    void setNormParams(const float minVals[AE_INPUT_SIZE],
                       const float maxVals[AE_INPUT_SIZE]);

    float train(const float input[AE_INPUT_SIZE]);

    void reconstruct(const float input[AE_INPUT_SIZE],
                     float output[AE_INPUT_SIZE]);

    float reconstructionError(const float input[AE_INPUT_SIZE]);

    bool isReady() const { return _trainCount >= AE_WARMUP_SAMPLES; }
    int  trainCount() const { return _trainCount; }

    float threshold() const { return _errMean + 3.0f * sqrtf(_errVar); }

private:

    float _w1[AE_HIDDEN_SIZE][AE_INPUT_SIZE];
    float _b1[AE_HIDDEN_SIZE];

    float _w2[AE_BOTTLENECK_SIZE][AE_HIDDEN_SIZE];
    float _b2[AE_BOTTLENECK_SIZE];

    float _w3[AE_HIDDEN_SIZE][AE_BOTTLENECK_SIZE];
    float _b3[AE_HIDDEN_SIZE];

    float _w4[AE_INPUT_SIZE][AE_HIDDEN_SIZE];
    float _b4[AE_INPUT_SIZE];

    float _minV[AE_INPUT_SIZE];
    float _maxV[AE_INPUT_SIZE];

    int   _trainCount;
    float _errMean;
    float _errVar;
    float _errM2;

    void  _normalise(const float raw[AE_INPUT_SIZE],
                           float norm[AE_INPUT_SIZE]) const;
    float _sigmoid(float x) const;
    float _sigmoidDeriv(float y) const;

    void _forward(const float norm[AE_INPUT_SIZE],
                  float h1[AE_HIDDEN_SIZE],
                  float bn[AE_BOTTLENECK_SIZE],
                  float h2[AE_HIDDEN_SIZE],
                  float out[AE_INPUT_SIZE]) const;

    void _backward(const float norm[AE_INPUT_SIZE],
                   const float h1[AE_HIDDEN_SIZE],
                   const float bn[AE_BOTTLENECK_SIZE],
                   const float h2[AE_HIDDEN_SIZE],
                   const float out[AE_INPUT_SIZE]);

    void _updateErrorStats(float err);

    void _initWeights();

    float _randWeight(float scale);
    uint32_t _rng;
};
