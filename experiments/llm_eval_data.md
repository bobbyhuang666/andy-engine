# LLM 评估: 社交情绪传染质量对比

## 实验场景
20 个 agent 参加晚间社交聚会。
- Tick 0-19: 正常社交，情绪稳定
- Tick 20: Alice, Bob, Carol 目睹令人不安的事件（情绪冲击: sadness+0.6, fear+0.4, anger+0.3, joy-0.5）
- Tick 20-80: 观察负面情绪如何在社交网络中传播

## 评估维度
1. 情绪传染的真实性（close friends 是否比 acquaintances 受影响更大？）
2. 情绪恢复的合理性（负面情绪是否随时间衰减？）
3. 个体差异的表现（高 susceptibility 的 agent 是否变化更大？）
4. 情绪极性的一致性（正面/负面情绪是否合理地相互抑制？）

## Full Sync 数据
```
=== Full Sync (全量同步) ===

--- Tick 0 (Hour 19.0) ---
  Alice      valence=  0.208 stress=0.00 [joy=0.051, calm=0.048, excitement=0.027]
  Bob        valence=  0.089 stress=0.00 [interest=0.032, joy=0.025, excitement=0.024]
  Carol      valence=  0.232 stress=0.00 [joy=0.062, calm=0.053, contentment=0.036]
  Eve        valence=  0.278 stress=0.00 [joy=0.076, calm=0.053, contentment=0.049]
  Grace      valence=  0.300 stress=0.00 [joy=0.091, calm=0.066, excitement=0.040]
  Iris       valence=  0.193 stress=0.00 [joy=0.068, love=0.027, excitement=0.026]
  Mia        valence=  0.183 stress=0.00 [joy=0.059, calm=0.041, contentment=0.032]
  Rachel     valence=  0.214 stress=0.00 [joy=0.065, calm=0.033, excitement=0.027]
  Henry      valence=  0.040 stress=0.00 [calm=0.013, excitement=0.010, interest=0.009]
  Paul       valence=  0.061 stress=0.00 [excitement=0.023, interest=0.017, joy=0.011]

--- Tick 5 (Hour 19.4) ---
  Alice      valence=  0.173 stress=0.00 [joy=0.038, calm=0.036, excitement=0.023]
  Bob        valence=  0.102 stress=0.00 [interest=0.026, joy=0.021, excitement=0.021]
  Carol      valence=  0.193 stress=0.00 [joy=0.047, calm=0.043, contentment=0.028]
  Eve        valence=  0.218 stress=0.00 [joy=0.050, calm=0.039, contentment=0.037]
  Grace      valence=  0.244 stress=0.00 [joy=0.062, calm=0.046, excitement=0.033]
  Iris       valence=  0.161 stress=0.00 [joy=0.046, calm=0.024, excitement=0.022]
  Mia        valence=  0.150 stress=0.00 [joy=0.043, calm=0.032, contentment=0.026]
  Rachel     valence=  0.187 stress=0.00 [joy=0.047, calm=0.027, excitement=0.023]
  Henry      valence=  0.073 stress=0.00 [sadness=-0.017, fear=-0.017, anger=-0.015]
  Paul       valence=  0.067 stress=0.00 [excitement=0.020, sadness=-0.018, fear=-0.016]

--- Tick 10 (Hour 19.8) ---
  Alice      valence=  0.128 stress=0.00 [joy=0.027, calm=0.024, fear=-0.024]
  Bob        valence=  0.071 stress=0.00 [anger=-0.025, fear=-0.023, frustration=-0.022]
  Carol      valence=  0.147 stress=0.00 [joy=0.034, calm=0.031, frustration=-0.025]
  Eve        valence=  0.156 stress=0.00 [joy=0.033, contentment=0.026, calm=0.026]
  Grace      valence=  0.188 stress=0.00 [joy=0.044, calm=0.034, excitement=0.025]
  Iris       valence=  0.117 stress=0.00 [joy=0.030, anger=-0.022, frustration=-0.021]
  Mia        valence=  0.111 stress=0.00 [joy=0.027, fear=-0.024, frustration=-0.024]
  Rachel     valence=  0.145 stress=0.00 [joy=0.033, fear=-0.026, anger=-0.023]
  Henry      valence=  0.071 stress=0.00 [sadness=-0.024, frustration=-0.022, fear=-0.021]
  Paul       valence=  0.066 stress=0.00 [sadness=-0.024, frustration=-0.023, fear=-0.020]

--- Tick 15 (Hour 20.3) ---
  Alice      valence=  0.071 stress=0.00 [anger=-0.027, sadness=-0.027, fear=-0.027]
  Bob        valence=  0.028 stress=0.00 [anger=-0.028, fear=-0.025, sadness=-0.025]
  Carol      valence=  0.091 stress=0.00 [frustration=-0.028, fear=-0.028, sadness=-0.028]
  Eve        valence=  0.096 stress=0.00 [frustration=-0.027, sadness=-0.027, anger=-0.027]
  Grace      valence=  0.127 stress=0.00 [anger=-0.028, joy=0.026, frustration=-0.025]
  Iris       valence=  0.069 stress=0.00 [frustration=-0.024, sadness=-0.023, anger=-0.023]
  Mia        valence=  0.062 stress=0.00 [anger=-0.030, sadness=-0.027, fear=-0.027]
  Rachel     valence=  0.098 stress=0.00 [fear=-0.028, anger=-0.027, frustration=-0.025]
  Henry      valence=  0.038 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.023]
  Paul       valence=  0.039 stress=0.00 [sadness=-0.026, frustration=-0.026, anger=-0.023]

--- Tick 19 (Hour 20.6) ---
  Alice      valence=  0.028 stress=0.00 [sadness=-0.028, anger=-0.027, fear=-0.027]
  Bob        valence=  0.003 stress=0.00 [anger=-0.028, fear=-0.025, sadness=-0.025]
  Carol      valence=  0.039 stress=0.00 [fear=-0.032, frustration=-0.029, sadness=-0.028]
  Eve        valence=  0.054 stress=0.00 [frustration=-0.028, anger=-0.027, fear=-0.025]
  Grace      valence=  0.070 stress=0.00 [anger=-0.028, sadness=-0.027, frustration=-0.026]
  Iris       valence=  0.029 stress=0.00 [frustration=-0.024, fear=-0.023, sadness=-0.023]
  Mia        valence=  0.033 stress=0.00 [anger=-0.029, fear=-0.027, sadness=-0.026]
  Rachel     valence=  0.050 stress=0.00 [anger=-0.028, fear=-0.026, sadness=-0.026]
  Henry      valence=  0.007 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.024]
  Paul       valence=  0.010 stress=0.00 [frustration=-0.023, sadness=-0.022, anger=-0.021]

--- Tick 20 (Hour 20.7) ---
  Alice      valence= -1.212 stress=0.00 [sadness=0.573, joy=-0.495, calm=-0.397]
  Bob        valence= -1.222 stress=0.00 [sadness=0.575, joy=-0.501, calm=-0.402]
  Carol      valence= -1.197 stress=0.00 [sadness=0.572, joy=-0.491, calm=-0.395]
  Eve        valence=  0.047 stress=0.00 [frustration=-0.027, anger=-0.027, fear=-0.024]
  Grace      valence=  0.056 stress=0.00 [anger=-0.028, frustration=-0.027, sadness=-0.027]
  Iris       valence=  0.022 stress=0.00 [fear=-0.023, sadness=-0.023, anger=-0.023]
  Mia        valence=  0.017 stress=0.00 [anger=-0.029, fear=-0.027, sadness=-0.026]
  Rachel     valence=  0.038 stress=0.00 [anger=-0.028, fear=-0.026, sadness=-0.026]
  Henry      valence=  0.002 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.023]
  Paul       valence=  0.005 stress=0.00 [frustration=-0.023, sadness=-0.022, anger=-0.021]

--- Tick 21 (Hour 20.8) ---
  Alice      valence= -0.631 stress=0.00 [joy=-0.328, sadness=0.283, calm=-0.255]
  Bob        valence= -0.778 stress=0.00 [joy=-0.403, sadness=0.382, calm=-0.313]
  Carol      valence= -0.504 stress=0.00 [joy=-0.298, sadness=0.246, calm=-0.230]
  Eve        valence=  0.044 stress=0.00 [frustration=-0.027, anger=-0.026, fear=-0.024]
  Grace      valence=  0.046 stress=0.00 [anger=-0.029, sadness=-0.028, frustration=-0.027]
  Iris       valence=  0.017 stress=0.00 [fear=-0.023, sadness=-0.023, anger=-0.023]
  Mia        valence=  0.009 stress=0.00 [anger=-0.027, fear=-0.027, sadness=-0.026]
  Rachel     valence=  0.032 stress=0.00 [anger=-0.028, fear=-0.026, sadness=-0.026]
  Henry      valence=  0.002 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.023]
  Paul       valence=  0.002 stress=0.00 [frustration=-0.022, sadness=-0.022, anger=-0.021]

--- Tick 22 (Hour 20.8) ---
  Alice      valence= -0.378 stress=0.00 [joy=-0.255, calm=-0.195, sadness=0.148]
  Bob        valence= -0.510 stress=0.00 [joy=-0.334, calm=-0.201, sadness=0.200]
  Carol      valence= -0.226 stress=0.00 [joy=-0.194, calm=-0.142, sadness=0.099]
  Eve        valence= -0.001 stress=0.00 [joy=-0.046, calm=-0.041, frustration=-0.026]
  Grace      valence= -0.008 stress=0.00 [joy=-0.042, calm=-0.037, frustration=-0.025]
  Iris       valence=  0.013 stress=0.00 [frustration=-0.022, anger=-0.016, fear=-0.014]
  Mia        valence= -0.008 stress=0.00 [joy=-0.038, calm=-0.031, frustration=-0.024]
  Rachel     valence=  0.023 stress=0.00 [anger=-0.027, fear=-0.025, sadness=-0.025]
  Henry      valence=  0.002 stress=0.00 [frustration=-0.023, fear=-0.021, sadness=-0.019]
  Paul       valence= -0.000 stress=0.00 [frustration=-0.022, sadness=-0.022, anger=-0.021]

--- Tick 23 (Hour 20.9) ---
  Alice      valence= -0.259 stress=0.00 [joy=-0.203, calm=-0.150, sadness=0.104]
  Bob        valence= -0.387 stress=0.00 [joy=-0.211, calm=-0.170, sadness=0.146]
  Carol      valence= -0.149 stress=0.00 [joy=-0.138, calm=-0.096, sadness=0.055]
  Eve        valence= -0.023 stress=0.00 [joy=-0.068, calm=-0.057, sadness=0.027]
  Grace      valence= -0.037 stress=0.00 [joy=-0.065, calm=-0.054, sadness=0.031]
  Iris       valence=  0.013 stress=0.00 [joy=-0.023, calm=-0.022, frustration=-0.021]
  Mia        valence= -0.031 stress=0.00 [joy=-0.054, calm=-0.048, frustration=-0.023]
  Rachel     valence=  0.016 stress=0.00 [anger=-0.027, fear=-0.025, sadness=-0.025]
  Henry      valence=  0.002 stress=0.00 [frustration=-0.023, fear=-0.018, joy=-0.016]
  Paul       valence=  0.001 stress=0.00 [frustration=-0.022, sadness=-0.021, anger=-0.020]

--- Tick 25 (Hour 21.1) ---
  Alice      valence= -0.183 stress=0.00 [joy=-0.130, calm=-0.102, sadness=0.067]
  Bob        valence= -0.214 stress=0.00 [joy=-0.127, calm=-0.114, sadness=0.078]
  Carol      valence= -0.112 stress=0.00 [joy=-0.102, calm=-0.081, sadness=0.042]
  Eve        valence= -0.030 stress=0.00 [joy=-0.070, calm=-0.057, sadness=0.028]
  Grace      valence= -0.030 stress=0.00 [joy=-0.072, calm=-0.055, sadness=0.028]
  Iris       valence=  0.010 stress=0.00 [joy=-0.035, calm=-0.031, frustration=-0.020]
  Mia        valence= -0.028 stress=0.00 [joy=-0.058, calm=-0.056, frustration=-0.022]
  Rachel     valence=  0.015 stress=0.00 [anger=-0.025, fear=-0.024, frustration=-0.023]
  Henry      valence=  0.001 stress=0.00 [frustration=-0.022, joy=-0.018, calm=-0.017]
  Paul       valence=  0.003 stress=0.00 [anger=-0.023, frustration=-0.023, sadness=-0.021]

--- Tick 30 (Hour 21.5) ---
  Alice      valence= -0.098 stress=0.00 [joy=-0.087, calm=-0.071, sadness=0.033]
  Bob        valence= -0.104 stress=0.00 [joy=-0.070, calm=-0.060, satisfaction=-0.031]
  Carol      valence= -0.055 stress=0.00 [joy=-0.074, calm=-0.065, triumph=-0.031]
  Eve        valence= -0.018 stress=0.00 [joy=-0.053, calm=-0.044, frustration=-0.021]
  Grace      valence= -0.011 stress=0.00 [joy=-0.061, calm=-0.046, frustration=-0.021]
  Iris       valence=  0.012 stress=0.00 [joy=-0.044, calm=-0.034, hope=-0.018]
  Mia        valence= -0.009 stress=0.00 [joy=-0.056, calm=-0.048, frustration=-0.019]
  Rachel     valence=  0.010 stress=0.00 [anger=-0.026, joy=-0.025, sadness=-0.020]
  Henry      valence= -0.002 stress=0.00 [joy=-0.029, calm=-0.027, satisfaction=-0.020]
  Paul       valence=  0.001 stress=0.00 [anger=-0.019, frustration=-0.019, sadness=-0.017]

--- Tick 35 (Hour 21.9) ---
  Alice      valence= -0.062 stress=0.00 [joy=-0.071, calm=-0.061, satisfaction=-0.035]
  Bob        valence= -0.068 stress=0.00 [joy=-0.058, calm=-0.052, satisfaction=-0.034]
  Carol      valence= -0.032 stress=0.00 [joy=-0.065, calm=-0.053, satisfaction=-0.035]
  Eve        valence= -0.010 stress=0.00 [joy=-0.044, calm=-0.043, satisfaction=-0.029]
  Grace      valence= -0.001 stress=0.00 [joy=-0.057, calm=-0.046, hope=-0.027]
  Iris       valence=  0.007 stress=0.00 [joy=-0.041, calm=-0.035, hope=-0.025]
  Mia        valence= -0.001 stress=0.00 [joy=-0.051, calm=-0.046, hope=-0.026]
  Rachel     valence=  0.000 stress=0.00 [joy=-0.039, calm=-0.030, satisfaction=-0.027]
  Henry      valence= -0.000 stress=0.00 [calm=-0.039, joy=-0.033, hope=-0.032]
  Paul       valence= -0.001 stress=0.00 [calm=-0.025, satisfaction=-0.024, hope=-0.024]

--- Tick 40 (Hour 22.3) ---
  Alice      valence= -0.041 stress=0.00 [joy=-0.064, calm=-0.056, satisfaction=-0.040]
  Bob        valence= -0.046 stress=0.00 [joy=-0.053, calm=-0.051, satisfaction=-0.038]
  Carol      valence= -0.032 stress=0.00 [joy=-0.058, calm=-0.054, contentment=-0.041]
  Eve        valence= -0.009 stress=0.00 [joy=-0.046, calm=-0.045, contentment=-0.036]
  Grace      valence=  0.002 stress=0.00 [joy=-0.057, calm=-0.052, excitement=-0.037]
  Iris       valence=  0.000 stress=0.00 [joy=-0.042, calm=-0.039, hope=-0.032]
  Mia        valence= -0.008 stress=0.00 [joy=-0.045, calm=-0.044, hope=-0.034]
  Rachel     valence= -0.001 stress=0.00 [joy=-0.043, satisfaction=-0.039, calm=-0.038]
  Henry      valence= -0.002 stress=0.00 [calm=-0.043, hope=-0.039, joy=-0.039]
  Paul       valence= -0.003 stress=0.00 [calm=-0.033, contentment=-0.032, joy=-0.032]

--- Tick 50 (Hour 23.2) ---
  Alice      valence= -0.066 stress=0.00 [joy=-0.063, contentment=-0.054, satisfaction=-0.051]
  Bob        valence= -0.078 stress=0.00 [joy=-0.051, satisfaction=-0.050, contentment=-0.050]
  Carol      valence= -0.068 stress=0.00 [contentment=-0.056, satisfaction=-0.056, joy=-0.054]
  Eve        valence= -0.071 stress=0.00 [satisfaction=-0.052, joy=-0.052, contentment=-0.052]
  Grace      valence= -0.044 stress=0.00 [joy=-0.061, excitement=-0.054, hope=-0.052]
  Iris       valence= -0.052 stress=0.00 [joy=-0.047, excitement=-0.045, contentment=-0.043]
  Mia        valence= -0.051 stress=0.00 [joy=-0.053, excitement=-0.050, contentment=-0.049]
  Rachel     valence= -0.042 stress=0.00 [satisfaction=-0.051, joy=-0.051, hope=-0.051]
  Henry      valence= -0.038 stress=0.00 [joy=-0.053, hope=-0.052, contentment=-0.051]
  Paul       valence= -0.029 stress=0.00 [excitement=-0.046, hope=-0.045, joy=-0.044]

--- Tick 60 (Hour 0.0) ---
  Alice      valence= -0.132 stress=0.00 [joy=-0.070, hope=-0.062, contentment=-0.061]
  Bob        valence= -0.121 stress=0.00 [joy=-0.062, contentment=-0.061, hope=-0.061]
  Carol      valence= -0.155 stress=0.00 [joy=-0.070, satisfaction=-0.068, hope=-0.065]
  Eve        valence= -0.137 stress=0.00 [contentment=-0.064, excitement=-0.063, joy=-0.061]
  Grace      valence= -0.127 stress=0.00 [joy=-0.071, excitement=-0.070, satisfaction=-0.066]
  Iris       valence= -0.123 stress=0.00 [joy=-0.059, satisfaction=-0.057, hope=-0.055]
  Mia        valence= -0.144 stress=0.00 [satisfaction=-0.064, excitement=-0.062, contentment=-0.061]
  Rachel     valence= -0.116 stress=0.00 [satisfaction=-0.065, hope=-0.064, joy=-0.063]
  Henry      valence= -0.118 stress=0.00 [joy=-0.063, hope=-0.060, excitement=-0.060]
  Paul       valence= -0.115 stress=0.00 [excitement=-0.060, hope=-0.060, contentment=-0.056]

--- Tick 70 (Hour 0.8) ---
  Alice      valence= -0.196 stress=0.00 [joy=-0.075, hope=-0.073, excitement=-0.070]
  Bob        valence= -0.195 stress=0.00 [satisfaction=-0.070, joy=-0.066, hope=-0.066]
  Carol      valence= -0.213 stress=0.00 [joy=-0.083, satisfaction=-0.082, excitement=-0.073]
  Eve        valence= -0.197 stress=0.00 [hope=-0.073, excitement=-0.072, satisfaction=-0.070]
  Grace      valence= -0.203 stress=0.00 [excitement=-0.083, hope=-0.079, joy=-0.076]
  Iris       valence= -0.173 stress=0.00 [satisfaction=-0.070, contentment=-0.069, hope=-0.066]
  Mia        valence= -0.196 stress=0.00 [satisfaction=-0.074, joy=-0.071, contentment=-0.071]
  Rachel     valence= -0.188 stress=0.00 [joy=-0.076, hope=-0.070, excitement=-0.070]
  Henry      valence= -0.179 stress=0.00 [hope=-0.075, excitement=-0.075, contentment=-0.069]
  Paul       valence= -0.181 stress=0.00 [hope=-0.071, contentment=-0.066, joy=-0.065]

--- 最终状态对比 (Tick 70) ---
  受害者平均 valence:     -0.604
  受害者朋友平均 valence: -0.958
  控制组平均 valence:     -0.360

```

## Hierarchical Contagion 数据
```
=== Hierarchical Contagion (分频传染) ===

--- Tick 0 (Hour 19.0) ---
  Alice      valence=  0.208 stress=0.00 [joy=0.051, calm=0.048, excitement=0.027]
  Bob        valence=  0.089 stress=0.00 [interest=0.032, joy=0.025, excitement=0.024]
  Carol      valence=  0.232 stress=0.00 [joy=0.062, calm=0.053, contentment=0.036]
  Eve        valence=  0.278 stress=0.00 [joy=0.076, calm=0.053, contentment=0.049]
  Grace      valence=  0.300 stress=0.00 [joy=0.091, calm=0.066, excitement=0.040]
  Iris       valence=  0.193 stress=0.00 [joy=0.068, love=0.027, excitement=0.026]
  Mia        valence=  0.183 stress=0.00 [joy=0.059, calm=0.041, contentment=0.032]
  Rachel     valence=  0.214 stress=0.00 [joy=0.065, calm=0.033, excitement=0.027]
  Henry      valence=  0.040 stress=0.00 [calm=0.013, excitement=0.010, interest=0.009]
  Paul       valence=  0.061 stress=0.00 [excitement=0.023, interest=0.017, joy=0.011]

--- Tick 5 (Hour 19.4) ---
  Alice      valence=  0.173 stress=0.00 [joy=0.038, calm=0.036, excitement=0.023]
  Bob        valence=  0.102 stress=0.00 [interest=0.026, joy=0.021, excitement=0.021]
  Carol      valence=  0.193 stress=0.00 [joy=0.047, calm=0.043, contentment=0.028]
  Eve        valence=  0.218 stress=0.00 [joy=0.050, calm=0.039, contentment=0.037]
  Grace      valence=  0.245 stress=0.00 [joy=0.063, calm=0.046, excitement=0.033]
  Iris       valence=  0.161 stress=0.00 [joy=0.046, calm=0.024, excitement=0.022]
  Mia        valence=  0.150 stress=0.00 [joy=0.043, calm=0.032, contentment=0.026]
  Rachel     valence=  0.187 stress=0.00 [joy=0.047, calm=0.027, excitement=0.023]
  Henry      valence=  0.073 stress=0.00 [sadness=-0.017, fear=-0.017, anger=-0.015]
  Paul       valence=  0.067 stress=0.00 [excitement=0.020, sadness=-0.018, fear=-0.016]

--- Tick 10 (Hour 19.8) ---
  Alice      valence=  0.128 stress=0.00 [joy=0.027, calm=0.024, fear=-0.024]
  Bob        valence=  0.071 stress=0.00 [anger=-0.025, fear=-0.023, frustration=-0.022]
  Carol      valence=  0.147 stress=0.00 [joy=0.034, calm=0.031, frustration=-0.025]
  Eve        valence=  0.156 stress=0.00 [joy=0.033, contentment=0.026, calm=0.026]
  Grace      valence=  0.189 stress=0.00 [joy=0.045, calm=0.034, excitement=0.025]
  Iris       valence=  0.117 stress=0.00 [joy=0.030, anger=-0.022, frustration=-0.021]
  Mia        valence=  0.111 stress=0.00 [joy=0.027, fear=-0.024, frustration=-0.024]
  Rachel     valence=  0.145 stress=0.00 [joy=0.033, fear=-0.026, anger=-0.023]
  Henry      valence=  0.071 stress=0.00 [sadness=-0.024, frustration=-0.022, fear=-0.021]
  Paul       valence=  0.066 stress=0.00 [sadness=-0.024, frustration=-0.023, fear=-0.020]

--- Tick 15 (Hour 20.3) ---
  Alice      valence=  0.071 stress=0.00 [anger=-0.027, sadness=-0.027, fear=-0.027]
  Bob        valence=  0.028 stress=0.00 [anger=-0.028, fear=-0.025, sadness=-0.025]
  Carol      valence=  0.091 stress=0.00 [frustration=-0.028, fear=-0.028, sadness=-0.028]
  Eve        valence=  0.096 stress=0.00 [frustration=-0.027, sadness=-0.027, anger=-0.027]
  Grace      valence=  0.127 stress=0.00 [anger=-0.028, joy=0.027, frustration=-0.025]
  Iris       valence=  0.069 stress=0.00 [frustration=-0.024, sadness=-0.023, anger=-0.023]
  Mia        valence=  0.062 stress=0.00 [anger=-0.030, sadness=-0.027, fear=-0.027]
  Rachel     valence=  0.098 stress=0.00 [fear=-0.028, anger=-0.027, frustration=-0.025]
  Henry      valence=  0.038 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.023]
  Paul       valence=  0.039 stress=0.00 [sadness=-0.026, frustration=-0.026, anger=-0.023]

--- Tick 19 (Hour 20.6) ---
  Alice      valence=  0.028 stress=0.00 [sadness=-0.028, anger=-0.027, fear=-0.027]
  Bob        valence=  0.003 stress=0.00 [anger=-0.028, fear=-0.025, sadness=-0.025]
  Carol      valence=  0.039 stress=0.00 [fear=-0.032, frustration=-0.029, sadness=-0.028]
  Eve        valence=  0.054 stress=0.00 [frustration=-0.028, anger=-0.027, fear=-0.025]
  Grace      valence=  0.070 stress=0.00 [anger=-0.028, sadness=-0.027, frustration=-0.026]
  Iris       valence=  0.029 stress=0.00 [frustration=-0.024, fear=-0.023, sadness=-0.023]
  Mia        valence=  0.033 stress=0.00 [anger=-0.029, fear=-0.027, sadness=-0.026]
  Rachel     valence=  0.050 stress=0.00 [anger=-0.028, fear=-0.026, sadness=-0.026]
  Henry      valence=  0.007 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.024]
  Paul       valence=  0.010 stress=0.00 [frustration=-0.023, sadness=-0.022, anger=-0.021]

--- Tick 20 (Hour 20.7) ---
  Alice      valence= -1.212 stress=0.00 [sadness=0.573, joy=-0.495, calm=-0.397]
  Bob        valence= -1.222 stress=0.00 [sadness=0.575, joy=-0.501, calm=-0.402]
  Carol      valence= -1.197 stress=0.00 [sadness=0.572, joy=-0.491, calm=-0.395]
  Eve        valence=  0.047 stress=0.00 [frustration=-0.027, anger=-0.027, fear=-0.024]
  Grace      valence=  0.056 stress=0.00 [anger=-0.028, frustration=-0.027, sadness=-0.027]
  Iris       valence=  0.022 stress=0.00 [fear=-0.023, sadness=-0.023, anger=-0.023]
  Mia        valence=  0.017 stress=0.00 [anger=-0.029, fear=-0.027, sadness=-0.026]
  Rachel     valence=  0.038 stress=0.00 [anger=-0.028, fear=-0.026, sadness=-0.026]
  Henry      valence=  0.002 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.023]
  Paul       valence=  0.005 stress=0.00 [frustration=-0.023, sadness=-0.022, anger=-0.021]

--- Tick 21 (Hour 20.8) ---
  Alice      valence= -0.678 stress=0.00 [joy=-0.345, sadness=0.305, calm=-0.268]
  Bob        valence= -0.800 stress=0.00 [joy=-0.411, sadness=0.393, calm=-0.319]
  Carol      valence= -0.538 stress=0.00 [joy=-0.311, sadness=0.263, calm=-0.240]
  Eve        valence=  0.044 stress=0.00 [frustration=-0.027, anger=-0.026, fear=-0.024]
  Grace      valence=  0.046 stress=0.00 [anger=-0.029, sadness=-0.028, frustration=-0.027]
  Iris       valence=  0.017 stress=0.00 [fear=-0.023, sadness=-0.023, anger=-0.023]
  Mia        valence=  0.009 stress=0.00 [anger=-0.027, fear=-0.027, sadness=-0.026]
  Rachel     valence=  0.032 stress=0.00 [anger=-0.028, fear=-0.026, sadness=-0.026]
  Henry      valence=  0.002 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.023]
  Paul       valence=  0.002 stress=0.00 [frustration=-0.022, sadness=-0.022, anger=-0.021]

--- Tick 22 (Hour 20.8) ---
  Alice      valence= -0.574 stress=0.00 [joy=-0.340, calm=-0.261, sadness=0.229]
  Bob        valence= -0.604 stress=0.00 [joy=-0.375, sadness=0.240, calm=-0.225]
  Carol      valence= -0.389 stress=0.00 [joy=-0.269, calm=-0.198, sadness=0.169]
  Eve        valence=  0.018 stress=0.00 [joy=-0.035, frustration=-0.026, calm=-0.025]
  Grace      valence=  0.037 stress=0.00 [anger=-0.029, sadness=-0.028, fear=-0.026]
  Iris       valence=  0.015 stress=0.00 [fear=-0.023, sadness=-0.023, anger=-0.022]
  Mia        valence=  0.003 stress=0.00 [joy=-0.025, frustration=-0.024, calm=-0.021]
  Rachel     valence=  0.023 stress=0.00 [anger=-0.027, fear=-0.025, sadness=-0.025]
  Henry      valence=  0.002 stress=0.00 [sadness=-0.026, fear=-0.025, frustration=-0.023]
  Paul       valence= -0.000 stress=0.00 [frustration=-0.022, sadness=-0.022, anger=-0.021]

--- Tick 23 (Hour 20.9) ---
  Alice      valence= -0.508 stress=0.00 [joy=-0.324, calm=-0.245, sadness=0.209]
  Bob        valence= -0.525 stress=0.00 [joy=-0.256, calm=-0.209, sadness=0.204]
  Carol      valence= -0.299 stress=0.00 [joy=-0.242, calm=-0.153, sadness=0.120]
  Eve        valence= -0.001 stress=0.00 [joy=-0.052, calm=-0.038, frustration=-0.026]
  Grace      valence=  0.026 stress=0.00 [anger=-0.028, frustration=-0.025, sadness=-0.024]
  Iris       valence=  0.013 stress=0.00 [fear=-0.022, sadness=-0.022, anger=-0.022]
  Mia        valence= -0.017 stress=0.00 [joy=-0.044, calm=-0.038, frustration=-0.023]
  Rachel     valence=  0.016 stress=0.00 [anger=-0.027, fear=-0.025, sadness=-0.025]
  Henry      valence=  0.002 stress=0.00 [sadness=-0.025, fear=-0.023, frustration=-0.023]
  Paul       valence=  0.001 stress=0.00 [frustration=-0.022, sadness=-0.021, anger=-0.020]

--- Tick 25 (Hour 21.1) ---
  Alice      valence= -0.298 stress=0.00 [joy=-0.228, calm=-0.161, sadness=0.112]
  Bob        valence= -0.339 stress=0.00 [joy=-0.180, calm=-0.157, sadness=0.127]
  Carol      valence= -0.162 stress=0.00 [joy=-0.159, calm=-0.105, sadness=0.068]
  Eve        valence= -0.033 stress=0.00 [joy=-0.080, calm=-0.057, frustration=-0.025]
  Grace      valence=  0.006 stress=0.00 [joy=-0.046, calm=-0.033, frustration=-0.024]
  Iris       valence=  0.012 stress=0.00 [frustration=-0.020, calm=-0.017, joy=-0.016]
  Mia        valence= -0.046 stress=0.00 [joy=-0.065, calm=-0.055, frustration=-0.022]
  Rachel     valence=  0.015 stress=0.00 [anger=-0.025, fear=-0.024, sadness=-0.024]
  Henry      valence=  0.001 stress=0.00 [frustration=-0.022, sadness=-0.021, fear=-0.020]
  Paul       valence=  0.003 stress=0.00 [anger=-0.023, frustration=-0.023, sadness=-0.021]

--- Tick 30 (Hour 21.5) ---
  Alice      valence= -0.148 stress=0.00 [joy=-0.129, calm=-0.094, satisfaction=-0.050]
  Bob        valence= -0.152 stress=0.00 [joy=-0.104, calm=-0.074, sadness=0.047]
  Carol      valence= -0.077 stress=0.00 [joy=-0.101, calm=-0.074, triumph=-0.037]
  Eve        valence= -0.026 stress=0.00 [joy=-0.073, calm=-0.053, frustration=-0.021]
  Grace      valence= -0.002 stress=0.00 [joy=-0.070, calm=-0.049, frustration=-0.021]
  Iris       valence=  0.013 stress=0.00 [joy=-0.037, calm=-0.029, hope=-0.018]
  Mia        valence= -0.031 stress=0.00 [joy=-0.068, calm=-0.055, frustration=-0.019]
  Rachel     valence=  0.010 stress=0.00 [anger=-0.026, joy=-0.024, sadness=-0.023]
  Henry      valence= -0.002 stress=0.00 [calm=-0.022, joy=-0.022, satisfaction=-0.020]
  Paul       valence=  0.001 stress=0.00 [anger=-0.019, frustration=-0.019, sadness=-0.017]

--- Tick 35 (Hour 21.9) ---
  Alice      valence= -0.094 stress=0.00 [joy=-0.098, calm=-0.075, satisfaction=-0.047]
  Bob        valence= -0.097 stress=0.00 [joy=-0.076, calm=-0.060, satisfaction=-0.038]
  Carol      valence= -0.048 stress=0.00 [joy=-0.084, calm=-0.058, satisfaction=-0.039]
  Eve        valence= -0.018 stress=0.00 [joy=-0.056, calm=-0.049, satisfaction=-0.029]
  Grace      valence=  0.006 stress=0.00 [joy=-0.063, calm=-0.048, hope=-0.027]
  Iris       valence=  0.007 stress=0.00 [joy=-0.040, calm=-0.033, hope=-0.025]
  Mia        valence= -0.016 stress=0.00 [joy=-0.065, calm=-0.051, hope=-0.026]
  Rachel     valence=  0.000 stress=0.00 [joy=-0.038, calm=-0.030, satisfaction=-0.027]
  Henry      valence= -0.000 stress=0.00 [calm=-0.036, hope=-0.032, joy=-0.029]
  Paul       valence= -0.001 stress=0.00 [calm=-0.025, satisfaction=-0.024, hope=-0.024]

--- Tick 40 (Hour 22.3) ---
  Alice      valence= -0.063 stress=0.00 [joy=-0.081, calm=-0.064, satisfaction=-0.048]
  Bob        valence= -0.064 stress=0.00 [joy=-0.064, calm=-0.055, satisfaction=-0.041]
  Carol      valence= -0.043 stress=0.00 [joy=-0.069, calm=-0.057, contentment=-0.043]
  Eve        valence= -0.014 stress=0.00 [joy=-0.054, calm=-0.049, contentment=-0.036]
  Grace      valence=  0.004 stress=0.00 [joy=-0.061, calm=-0.053, excitement=-0.037]
  Iris       valence=  0.003 stress=0.00 [joy=-0.043, calm=-0.038, hope=-0.032]
  Mia        valence= -0.017 stress=0.00 [joy=-0.051, calm=-0.047, hope=-0.034]
  Rachel     valence= -0.001 stress=0.00 [joy=-0.042, satisfaction=-0.039, calm=-0.038]
  Henry      valence= -0.002 stress=0.00 [calm=-0.041, hope=-0.039, satisfaction=-0.038]
  Paul       valence= -0.003 stress=0.00 [calm=-0.033, contentment=-0.032, joy=-0.032]

--- Tick 50 (Hour 23.2) ---
  Alice      valence= -0.078 stress=0.00 [joy=-0.070, contentment=-0.057, satisfaction=-0.055]
  Bob        valence= -0.086 stress=0.00 [joy=-0.055, satisfaction=-0.051, contentment=-0.051]
  Carol      valence= -0.073 stress=0.00 [joy=-0.057, contentment=-0.057, satisfaction=-0.057]
  Eve        valence= -0.073 stress=0.00 [joy=-0.055, satisfaction=-0.052, contentment=-0.052]
  Grace      valence= -0.041 stress=0.00 [joy=-0.062, excitement=-0.054, hope=-0.052]
  Iris       valence= -0.050 stress=0.00 [joy=-0.047, excitement=-0.045, contentment=-0.043]
  Mia        valence= -0.057 stress=0.00 [joy=-0.056, excitement=-0.050, contentment=-0.049]
  Rachel     valence= -0.042 stress=0.00 [satisfaction=-0.051, hope=-0.051, joy=-0.050]
  Henry      valence= -0.036 stress=0.00 [hope=-0.052, joy=-0.052, contentment=-0.051]
  Paul       valence= -0.029 stress=0.00 [excitement=-0.046, hope=-0.045, joy=-0.044]

--- Tick 60 (Hour 0.0) ---
  Alice      valence= -0.138 stress=0.00 [joy=-0.074, hope=-0.062, contentment=-0.062]
  Bob        valence= -0.124 stress=0.00 [joy=-0.063, contentment=-0.062, hope=-0.061]
  Carol      valence= -0.161 stress=0.00 [joy=-0.071, satisfaction=-0.069, hope=-0.065]
  Eve        valence= -0.138 stress=0.00 [contentment=-0.064, excitement=-0.063, joy=-0.062]
  Grace      valence= -0.126 stress=0.00 [joy=-0.071, excitement=-0.070, satisfaction=-0.066]
  Iris       valence= -0.122 stress=0.00 [joy=-0.059, satisfaction=-0.057, hope=-0.055]
  Mia        valence= -0.147 stress=0.00 [satisfaction=-0.064, excitement=-0.062, contentment=-0.061]
  Rachel     valence= -0.116 stress=0.00 [satisfaction=-0.065, hope=-0.064, joy=-0.063]
  Henry      valence= -0.117 stress=0.00 [joy=-0.062, hope=-0.060, excitement=-0.060]
  Paul       valence= -0.115 stress=0.00 [excitement=-0.060, hope=-0.060, contentment=-0.056]

--- Tick 70 (Hour 0.8) ---
  Alice      valence= -0.199 stress=0.00 [joy=-0.076, hope=-0.073, excitement=-0.070]
  Bob        valence= -0.196 stress=0.00 [satisfaction=-0.070, joy=-0.067, hope=-0.066]
  Carol      valence= -0.217 stress=0.00 [joy=-0.084, satisfaction=-0.082, excitement=-0.073]
  Eve        valence= -0.198 stress=0.00 [hope=-0.073, excitement=-0.072, satisfaction=-0.070]
  Grace      valence= -0.203 stress=0.00 [excitement=-0.083, hope=-0.079, joy=-0.076]
  Iris       valence= -0.173 stress=0.00 [satisfaction=-0.070, contentment=-0.069, hope=-0.066]
  Mia        valence= -0.197 stress=0.00 [satisfaction=-0.074, joy=-0.071, contentment=-0.071]
  Rachel     valence= -0.188 stress=0.00 [joy=-0.076, hope=-0.070, excitement=-0.070]
  Henry      valence= -0.178 stress=0.00 [hope=-0.075, excitement=-0.075, contentment=-0.069]
  Paul       valence= -0.181 stress=0.00 [hope=-0.071, contentment=-0.066, joy=-0.065]

--- 最终状态对比 (Tick 70) ---
  受害者平均 valence:     -0.612
  受害者朋友平均 valence: -0.958
  控制组平均 valence:     -0.359

```
