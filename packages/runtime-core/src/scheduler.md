```js
let currentFlushPromise = null
const resolvedPromise = Promise.resolve()\
const queue: SchedulerJob[] = []
let flushIndex = -1
function nextTick(fn) {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(fn) : p
}
//
findInsertionIndex(jobId) {
  return
}
queueJob(job) {
  if (!(job.flags! & SchedulerJobFlags.QUEUED)) {
    const jobId = getId(job) // number or Infinity
    const lastJob = queue[queue.length - 1]
    // ': 表示无PRE标识的 job
    // ^: 表示有PRE标识的 job
    // [1, 3, 5^, 7, 9] + 2'  ->   [1, 2', 3,  5^,  7, 9]
    // [1, 3, 5^, 7, 9] + 3'  ->   [1, 3', 3,  5^,  7, 9]
    // [1, 3, 5^, 7, 9] + 3^  ->   [1, 3^, 3,  5^,  7, 9]
    // 若是插入的值相等的位置是 有 PRE 标识的, 那么则需要插入在 PRE 标识的后面, 而不是前面
    // 这里要插入的位置 为 5^ 所在的索引, 本来应该放在 5^ 前面, 但是这里插入的位置恰好 id 相等都是 5
    // 这种情况 id 相等的情况, 插入的位置返回的索引所在的 job 又有 PRE 标识, 那么应该插入在其 后面
    // 否则插入在其前面
    // [1, 3, 5^, 7, 9] + 5' ->    [1, 3,  5^, 5',  7, 9]
    // [1, 3, 5^, 7, 9] + 5^^ ->   [1, 3,  5^, 5^^, 7, 9]
    // 若是插入的 job id 比最后元素的 id 大或者相等 , 并且不是 PRE 标识的 job, 那么直接插入到最后面
    // [1, 3, 5^, 7, 9] + 9' ->    [1, 3,  5^,  7,  9, 9']  // 最后一个元素相等
    // [1, 3, 5^, 7, 9] + 10' ->   [1, 3,  5^,  7, 9, 10'] // 比最后一个元素大
    // 若是插入的 job id 比最后元素的 id 大或者相等, 但是插入的 job 有 PRE 标识的 job 不要直接插入到最后
    // [1, 3, 5^, 7, 9] + 10^ ->   [1, 3,  5^, 7, 9, 10^]
    // [1, 3, 5^, 7, 9] + 9^  ->   [1, 3,  5^, 7, 9^, 9] // 这种情况虽然与最后一个相等, 但是要插入在其前面
    if(jobId >= getId(lastJob)) {
      if(!(job.flags! & SchedulerJobFlags.PRE)) {
        queue.push(job)
      }
    } else {
      // 注意这里的插入是从 flushIndex 开始插入, 前面执行过了的 job, 不再考虑
      // flushIndex 表示当前正在执行的那个 job 再 queue 中所在的索引
      // 不是每次都从头开始查找插入的
      queue.splice(findInsertionIndex(jobId), 0, job)
    }
    job.flags! |= SchedulerJobFlags.QUEUED
    queueFlush() {
      if (currentFlushPromise) return
      currentFlushPromise = resolvedPromise.then(flushJobs() {
        // 异步执行中, 只有 flushJobs 本函数执行完后, currentFlushPromise 才会 resolve
        // 也就是 nextTick(fn) 中 依赖 currentFlushPromise 的 resolve 才会执行, 即其回调函数
        // 需要等 这里的 flushJobs 函数执行完后, 才会执行 nextTick()
        // flushJobs 函数执行完, 标识 queue, pendingPostFlushCbs 中的队列已经清空了
        try {
          // [1, 3, 5, 7]
          //     |
          //     flushIndex
          //     queueJob(6) -> 只能在 flushIndex 后面进行插入
          // [1, 3, 5, 6, 7]
          //     |flushIndex
          for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
            const job = queue[flushIndex]
            // job 没有 DISPOSED 标识, 表示没有被废弃
            if (job && !(job.flags! & SchedulerJobFlags.DISPOSED)) {
              if (job.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
                // 若是这里 job 函数允许递归(自己调用自己)执行, 则去掉 QUEUED 标识,
                // 以便在下面的 job() { job() } 递归调用自己
                job.flags! &= ~SchedulerJobFlags.QUEUED
              }
              job() {
                // job() 递归调用
                // queueJob(job) 执行 job 时, 又增加新的 job
                // 此时的 flushIndex 就是当前正在执行的这个 job 所在 queue 中 index
                // 若是这里面又进行执行 queue(job), 插入队列 job, 那么此时不是从头开始查找插入的
                // 而是从 [flushIndex + 1, end] 开始进行插入, 不包括本身 flushIndex, 这里在
                // findInsertionIndex 中的查找 start = flushIndex + 1 的开始位置是 + 1 的, 这一点务必注意
                queueJob(job) {
                  // 这里同一个 job, 若是没有去除 QUEUED 标识 则插入不进来
                  if ((job.flags! & SchedulerJobFlags.QUEUED)) return
                  const jobId = getId(job) // number or Infinity
                  // 注意是从 flushIndex + 1 开始插入
                  queue.splice(findInsertionIndex(jobId), 0, job)
                  // 这里插入新的 job 到 flushIndex 后面, queue.length 变化了 , 那么在后面的循环中
                  // 就可以执行这个插入的 job 函数, 因为是查在 当前 for 循环索引的后面, 所以在后面的for 循环中,
                  // 是可以继续执行这个插入函数的
                  // 设置 QUEUED 标识, 避免重复插入
                  job.flags! |= SchedulerJobFlags.QUEUED
                  queueFlush() {
                    // 这里的 currentFlushPromise 有值 直接 return
                    if (currentFlushPromise) return
                  }
                }
              }
              // 这里 job 执行完毕了, 不允许递归调用, 去掉 QUEUED 标识
              if (!(job.flags! & SchedulerJobFlags.ALLOW_RECURSE)) {
                job.flags! &= ~SchedulerJobFlags.QUEUED
              }
            }
          }
        } finally {
          // If there was an error we still need to clear the QUEUED flags
          for (; flushIndex < queue.length; flushIndex++) {
            // 若是执行到这里的 for 循环中, 说明上面的 for 循环执行被中断了
            // 上面的 for 循环执行完后, 理论上(不出现错误)的情况下, flushIndex == queue.length,
            // 除非错误中断了 for 循环, 最终执行到 finally 中, 此时可能 flushIndex 小于 queue.length,
            const job = queue[flushIndex]
            if (job) {
              // 因为出错了, 这里清空 QUEUED 标识, 同时需要清空 queue.length = 0
              // 这里不能先清空 queue.length = 0, 若是先清空 queue.length = 0,
              // 则不能清空其他 job 函数的 QUEUED 标识,
              job.flags! &= ~SchedulerJobFlags.QUEUED
            }
          }
          // 这里不管有无出错,最终都会执行到这里
          // 此时说明 queue 中任务都执行完毕了, 即使出错也当做执行完毕
          flushIndex = -1
          queue.length = 0

          flushPostFlushCbs() {
            // 这里面又执行 queueJob(job)
            // 同时注意这里面执行时, currentFlushPromise 不等于 null, 那么执行 queueJob(job)
            // 只是往队列中 queue 插入 job, 执行不了 queueFlush(),
            // 注意此时的 queue.length = 0, flushIndex = -1 已经重置了
            queueJob(job) {
              // queue.push(job)
              // 这里同一个 job, 若是没有去除 QUEUED 标识 则插入不进来
              if ((job.flags! & SchedulerJobFlags.QUEUED)) return
              const jobId = getId(job) // number or Infinity
              // 注意是从 flushIndex + 1 开始插入
              queue.splice(findInsertionIndex(jobId), 0, job)
              // 这里插入新的 job 到 flushIndex 后面, queue.length 变化了 , 那么在后面的循环中
              // 就可以执行这个插入的 job 函数, 因为是查在 当前 for 循环索引的后面, 所以在后面的for 循环中,
              // 是可以继续执行这个插入函数的
              // 设置 QUEUED 标识, 避免重复插入
              job.flags! |= SchedulerJobFlags.QUEUED
              queueFlush() {
                // 这里的 currentFlushPromise 有值 直接 return
                if (currentFlushPromise) return
              }
            }
          }

          currentFlushPromise = null

          // 这里的 queue.length > 0 只有可能是在 flushPostFlushCbs(seen)中 添加了任务
          // 因为执行 flushPostFlushCbs(seen)前, 清空了 queue.length = 0
          // If new jobs have been added to either queue, keep flushing
          if (queue.length || pendingPostFlushCbs.length) {
            // 前面的 currentFlushPromise 置为了 null
            flushJobs()
          }
        }
      })
    }
  }
}
```
