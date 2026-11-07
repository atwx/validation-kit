---
id: inv-ln-003
title: LN-003 Late fee capped at 10 EUR
ref: LN-003
target: question
build: as_target
questions:
  - q-001
---

## Assessment

The legacy system does not cap the fee. Members have paid uncapped fees for years, so changing it changes revenue and needs the client's decision.

## Implementation

The rebuild keeps the uncapped fee until the client decides (rule test `FeeTest::testUncappedLikeLegacy`).
