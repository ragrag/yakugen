<div align="center">

<img src="https://github.com/user-attachments/assets/fd46e142-f931-4392-98d9-224b5f85ce25" alt="nostalgia" height="300">

</div>

## About

**yakugen** _(yaku-gen)_ is a dynamic promise executor for Node.js. yakugen dynamically adjusts Promise concurrency to maximize performance whilst meeting target CPU & Event Loop Utilization metrics.

## API Reference: https://github.com/ragrag/ragrag.github.io/yakugen

### Installing

```base
npm install yakugen
```

### Examples

#### Usage

```typescript
async function asyncTask(item){
    await doSomething();
}

const items = new Array(1000).fill(Math.random());
const tasks = items.map(it => async () => {
    return asyncTask(it);
});

const resAll = await Yakugen.all(tasks);
const resAllSettled = await Yakugen.allSettled(tasks);
```

---

#### Controlling Concurrency Limits

```typescript
async function asyncTask(item){
    await doSomething();
}

const items = new Array(1000).fill(Math.random());
const tasks = items.map(it => async () => {
    return asyncTask(it);
});

const res = await Yakugen.all(tasks, { minConcurrency: 5, maxConcurrency: 50 });
```

Yakugen defaults:
- ```minConcurrency```: 1
- ```maxConcurrency```: 5000 

---
#### Controlling Target Metrics

```typescript
async function asyncTask(item){
    await doSomething();
}

const items = new Array(1000).fill(Math.random());
const tasks = items.map(it => async () => {
    return asyncTask(it);
});

const res = await Yakugen.all(tasks, { targetMetrics: { cpuUtilization: 60, eventLoopUtilization: 65, eventLoopDelayMs: 100 } });
```

Yakugen defaults:
- ```cpuUtilization```: 75
- ```eventLoopUtilization```: 75 
- ```eventLoopDelayMs```: 150 

---
#### Custom Concurrency Control

```typescript
async function asyncTask(item){
    await doSomething();
}

const items = new Array(1000).fill(Math.random());
const tasks = items.map(it => async () => {
    return asyncTask(it);
});

const res = await Yakugen.all(tasks, {
    isHealthy: (metrics, concurrency) => {
        return metrics.cpuUtilization < 0.5 && metrics.eventLoopUtilization < 0.6 && metrics.eventLoopDelayMs < 100 && concurrency < 200;
    },
});
```
