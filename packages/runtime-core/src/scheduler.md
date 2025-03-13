```js
let currentFlushPromise = null
const resolvedPromise = Promise.resolve()

const queue: SchedulerJob[] = []
// 为何这里的 flushIndex 是 -1 ？
// 这里要从 findInsertionIndex 的 start
let flushIndex = -1

const pendingPostFlushCbs: SchedulerJob[] = []
let activePostFlushCbs: SchedulerJob[] | null = null
let postFlushIndex = 0

function nextTick(fn) {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(fn) : p
}

// 查找按顺序插入
// 若是相同则插入在前面
// 但是有 PRE 标识的则插入在后面
function findInsertionIndex(id: number) {
  // 这里 start = flushIndex + 1 是为了跳过当执行的 job, 从下一个开始查找插入
  // const job1 = () => {
  //   calls.push('job1')
  //   这里 queueJob() 在 job1 内部嵌套调用，在执行 findInsertionIndex 时的 start 应该+1 跳过当前的 job
  //   [job1], 应该从 1 开始，不应该从 0 开始，若是 从 0 开始，就会插入正在执行的 job1 的前面
  //   queueJob(job2)
  //   queueJob(job3)
  // }
  // queueJob(job1)
  // 这里的 flushIndex + 1 就说明为何 flushIndex 初始值为 -1
  // 因为若是初始值为 0 的话，那么 start 就是从 1 开始，这不符合数组索引的初始值 0
  // 因为初始的插入，可能是第一次，那么就必须包含从数组第一个元素开始，此时索引为 0
  // 之后第二次，需要跳过当前索引，那么直接 + 1 即可跳过
  // 所以 flushIndex 初始值为 -1，既满足了数组开始从 0 开始，
  // 又满足 + 1 跳过当前索引的问题
  let start = flushIndex + 1
  // 为何这里不是 queue.length - 1 ? 也可以,实现细节不同而已
  // 实现参考: https://github.com/flczcy/devtips/issues/326
  let end = queue.length

  // NOTE: 这里二分查找的 start 位置不一定要从 0 起始, 这里的 start 是变化的
  while (start < end) {
    const middle = (start + end) >>> 1
    const middleJob = queue[middle]
    const middleJobId = getId(middleJob) // job.id 不存在则为 Infinity
    // Infinity === Infinity -> true
    if (
      middleJobId < id ||
      (middleJobId === id && middleJob.flags! & SchedulerJobFlags.PRE)
    ) {
      // 要查找的 id 在中间值的右边
      // 要插入的 id > 中间值 id 或者
      // 要插入的 id = 中间值 id, 同时 中间值有 PRE 标记，则插在 PRE 标记的右边
      // 这里保证插入的 id 与 PRE 的 id 相等时，总是插在 PRE 右边，保证 PRE 在插入的 id 前面
      // 其他相等的情况则统一插在中间值的左边
      // NOTE: 注意这里是判断中间值的 PRE, 不是判断插入进来的 job 是否有 PRE
      // id = 4',
      // [1, 2, 3] - [4, 5, 6]
      //                 insertIndex
      // id = 4
      // [1, 2, 3, 4, 5, 6]
      // [1, 2, 3] - [4, 5, 6]
      // start = 0, end = 6, middle = 3, job = 4 job = 4
      // start = 4, end = 6, middle = 5, job = 6 job > 4
      // start = 4, end = 5, middle = 4, job = 5 job > 4
      // start = 4, end = 4
      // return 4
      //
      // [1, 2, 3, 4(PRE), 4', 5, 6]
      start = middle + 1
      // start 4, end 6
      //
    } else {
      // id = 4'
      // [1, 2, 3, 4, 5, 6]
      // [1, 2, 3] - [4, 5, 6]
      // start = 0, end = 6, middle = 3, job = 4 job = 4
      // start = 0, end = 3, middle = 1, job = 2 job < 4
      // start = 2, end = 3, middle = 2, job = 3 job < 4
      // start = 3, end = 3
      // return 3
      // 否则插入到前面
      // [1, 2, 3] - [4, 5, 6]
      //              | insertIndex
      // [1, 2, 3, 4', 4, 5, 6]
      end = middle
    }
  }
  return start
}

// setup() {
//   watch 是在 setup 函数中调用
//   watch(() => foo.a, cb)
//   每一次的 dep.set 都会触发
//   dep.trigger() -> e.trigger -> e.scheduler() {
//     queueJob(() => e.run())
//   }
//   当 foo.a++ -> dep.trigger() -> queueJob(componentUpdateFn)
// }
dep.trigger() {
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
        // flushIndex 表示当前正在执行的那个 job 在 queue 中所在的索引
        // 不是每次都从头开始查找插入的
        queue.splice(findInsertionIndex(jobId), 0, job)
      }
      job.flags! |= SchedulerJobFlags.QUEUED
      queueFlush() {
        if (currentFlushPromise) return
        // queueFlush 总是先执行 queue 中 job, 然后执行 flushPostFlushCbs()
        // 只要 queue 中有 job, 总是先执行完 queue 后，最后才开始执行 postFlush
        currentFlushPromise = resolvedPromise.then(flushJobs() {
          // 异步执行中, 只有 flushJobs 本函数执行完后, currentFlushPromise 才会 resolve
          // 也就是 nextTick(fn) 中 依赖 currentFlushPromise 的 resolve 才会执行, 即其回调函数
          // 需要等 这里的 flushJobs 函数执行完后, 才会执行 nextTick()
          // flushJobs 函数执行完, 标识 queue, pendingPostFlushCbs 中的队列已经清空了
          try {
            // flushIndex == 3
            // [1, 3, 5, 7]
            //     |
            //     flushIndex
            //     queueJob(6) -> 只能在 flushIndex 后面进行插入
            // [1, 3, 5, 6, 7]
            //     |flushIndex
            //     queueJob(2) -> 只能在 flushIndex 后面进行插入, 即使这里的 2 比 3 小, 也要插入在 3 的后面
            // [1, 3, 2, 5, 6, 7]
            for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
              const job = queue[flushIndex]
              // job 没有 DISPOSED 标识, 表示没有被废弃
              if (job && !(job.flags! & SchedulerJobFlags.DISPOSED)) {
                if (job.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
                  // 若是这里 job 函数允许递归(自己调用自己)执行, 则去掉 QUEUED 标识,
                  // 以便在下面的 job() { job() } 递归调用自己
                  // 这里应是指在执行中是否可以递归插入自己到队列中执行，
                  // 当队列执行到插入的自己时，里面又将自己插到队列中执行，然后下一次又执行到自己，然后又插入队列，...
                  // 最终这会导致无线递归执行，所以允许递归插入时，一定要有退出递归的条件
                  job.flags! &= ~SchedulerJobFlags.QUEUED
                }
                job() {
                  // job() 中又重复插入自己
                  // queueJob(job) 执行 job 时, 又增加新的 job
                  // 此时的 flushIndex 就是当前正在执行的这个 job 所在 queue 中 index
                  // 若是这里面又进行执行 queue(job), 插入队列 job, 那么此时不是从头开始查找插入的
                  // 而是从 [flushIndex + 1, end] 开始进行插入, 不包括本身 flushIndex, 这里在
                  // findInsertionIndex 中的查找 start = flushIndex + 1 的开始位置是 + 1 的, 这一点务必注意
                  // 本来队列就开始顺序执行，但是在执行中又开始插队执行
                  queueJob(job) {
                    // 这里在 job 中, 若是这里插入的 job 自己本身(正在执行的 job) 的话
                    // 1. 若是无 ALLOW_RECURSE, 因之前插入一次, 有 QUEUED 标识, 故不可重复插入
                    // 2. 若是有 ALLOW_RECURSE, 则会在执行时，去掉 QUEUED，此时就可以重复插入相同的 job
                    //    那么此种情况就属于插入的 id 相同，
                    //    具体插入位置查看 findInsertionIndex 针对相同 id 的处理情况
                    //    特别要注意这里开启递归插入后，需要设置递归退出条件，否则会无限递归插入
                    //    [a,b,c,d]
                    //       | 当前执行的 job b, 然后插入相同的 job b, 假设 job b 设置了 ALLOW_RECURSE
                    //    [a,b,b,c,d]
                    //         | 然后 for 执行下一个 job, 这里又是上一次插入的 b, 此时执行到这里后，queueJob(b)
                    //           发现 b.ALLOW_RECURSE 存在，故插入到队列：[a,b,b,b,c,d]
                    //    [a,b,b,b,c,d]
                    //           | for 执行下一个 job, 这里又是上一次插入的 b，同时继续执行 queueJob(b)
                    //           此时 b.ALLOW_RECURSE 存在，故插入到队列：[a,b,b,b,b,c,d]
                    //     ... 这样如此往复的插入 b, 然后下一个执行的又是 b, b 中又执行 queueJob(b)，
                    //    这就导致了无限的递归插入执行了，所以这里的递归退出条件就是
                    //    在某次递归后，将 b.ALLOW_RECURSE 移除，这样下次执行的 QUEUED 就不会移除，从而阻止其
                    //    重复加入到队列之中
                    //    比如 foo.a = 1, 第一次执行 set 的更新, 第二次再次 set, 但是值不变, 还是 1, 此时
                    //    不会再次触发 dep.trigger(), 就不会再次插入到队列,所以这就是递归的退出条件, 有限的递归
                    //    但是 foo.a++, 每一次都是 set 触发更新, 每次都执行 queueJob() 这会导致无限更新
                    //    假设
                    //    job.flags! |= SchedulerJobFlags.ALLOW_RECURSE
                    //    queueJob(job) {
                    //      job.flags! |= SchedulerJobFlags.QUEUED
                    //      if (job.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
                    //        job.flags! &= ~SchedulerJobFlags.QUEUED
                    //      }
                    //      queueJob(job) {
                    //        job.flags! |= SchedulerJobFlags.QUEUED
                    //        if (job.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
                    //          job.flags! &= ~SchedulerJobFlags.QUEUED
                    //        }
                    //      }
                    //    }
                    //    job.flags! &= ~SchedulerJobFlags.ALLOW_RECURSE
                    // 3. 可以插入其他的 job
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
                  // 在 job 里面，一般是组件的更新函数，会执行组件生命钩子函数(beforeUpdate,updated)
                  // instance.bm, instance.u 这些组件上面的钩子函数都是数组
                  // 在这里将 cb 放入 pendingPostFlushCbs，延迟执行，
                  // 先将这些 cb pending 起来，不在主队列更新函数中执行，
                  // 而是等到 queue 中 job 全部执行完后，再执行
                  queuePostFlushCb(cb) {
                    if(isArray(cb)) {
                      pendingPostFlushCbs.push(...cb)
                    } else {
                      if (activePostFlushCbs && cb.id === -1) {
                        // postFlushIndex 是正在执行的 cb 的 index
                        activePostFlushCbs.splice(postFlushIndex + 1, 0, cb)
                      } else if (!(cb.flags! & SchedulerJobFlags.QUEUED)) {
                        pendingPostFlushCbs.push(cb)
                        cb.flags! |= SchedulerJobFlags.QUEUED
                      }
                    }
                    queueFlush(){
                      if (currentFlushPromise) return
                    }
                  }
                  // 在 job 内部执行 所有的带有 PRE 标识的 job, 执行完后从队列中移除该函数
                flushPreFlushCbs(instance， seen, i = flushIndex + 1) {
                  // 这里 flushIndex 的初始值为 -1，所以即使这里不在 queue job 执行里面调用也是可以的
                  // 1. job 外部调用，那么此时的 flushIndex 为 -1，这里再 +1 就是 0 也不会导致数组越界
                  // 2. job 内部调用，此时的 flushIndex 就是当前正在执行的 job 在队列中的 index，所以这里 + 1
                  //    表示从下一个 job 开始逐个查找 PRE 标识的 job 进行同步执行
                  //    此时会阻塞当前正在执行的 job, 直到队列中所有的 job.PRE 执行完毕后，才会继续往下执行当前 job
                  //    同时注意 job.PRE 执行完一次后就会从队列中移除
                  for (; i < queue.length; i++) {
                    const cb = queue[i]
                    if (cb && cb.flags! & SchedulerJobFlags.PRE) {
                      queue.splice(i, 1) // 从 queue 中移除
                      i--
                      cb()
                    }
                  }
                }
                // 这里面也可以调用 flushPostFlushCbs 执行 通过 queuePostFlushCb(cb) 注册的函数
                  // 进行提前执行，不过这里面一般是组件更新函数，通常不在这里执行 flushPostFlushCbs
                  // 不过 watch 的更新函数，可能会会这么执行
                  flushPostFlushCbs() { }
                }

                // 若是允许 ALLOW_RECURSE, 上面进入 for 时，已经去掉 QUEUED 标识了，
                // 这里无需重复去除

                // 这里 job 执行完毕了, 若是不允许递归调用, 去掉 QUEUED 标识
                // 因为已经执行完，需要去掉 QUEUED，以便下一次可以继续放入队列中执行
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
            if (pendingPostFlushCbs.length === 0) return
            // 去重排序
            const deduped = [...new Set(pendingPostFlushCbs)].sort( (a, b) => getId(a) - getId(b))
            pendingPostFlushCbs.length = 0
            if (activePostFlushCbs) {
              activePostFlushCbs.push(...deduped)
              return
            }
            activePostFlushCbs = deduped
            for (
              postFlushIndex = 0;
              postFlushIndex < activePostFlushCbs.length;
              postFlushIndex++
            ) {
              const cb = activePostFlushCbs[postFlushIndex]
              if (cb.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
                cb.flags! &= ~SchedulerJobFlags.QUEUED
              }
              // 若是没有 DISPOSED 标识, 则执行 cb()
              if (!(cb.flags! & SchedulerJobFlags.DISPOSED)) cb() {
                // 注意此时在 flushPostFlushCbs 中执行 queueJob，说明之前的 queue 已经执行完清空了
                // 那么此时的 queue.length = 0, flushIndex = -1 已经重置了
                queueJob(job) {
                  if ((job.flags! & SchedulerJobFlags.QUEUED)) return
                  const jobId = getId(job) // number or Infinity
                  queue.splice(findInsertionIndex(jobId), 0, job)
                  job.flags! |= SchedulerJobFlags.QUEUED
                  queueFlush() {
                    // 这里的 currentFlushPromise 有值 直接 return
                    if (currentFlushPromise) return
                  }
                }
                // 执行中动态新增 cb 不立即插入执行队列(activePostFlushCbs)执行,
                // 而是放入挂起队列(pendingPostFlushCbs) 中，等要当前执行队列(activePostFlushCbs)全部执行
                // 完后，再次调用 flushJobs() 执行
                // 但是有些列外：就是在动态执行中，临时插入的 cb.id === -1, 则不会放入
                // 挂起队列(pendingPostFlushCbs) 中，而是直接插队到下一个 cb 执行，这是属于 VIP 插队执行
                queuePostFlushCb(cb) {
                  if(isArray(cb)) {
                    // 此时若是数组，则会放入 pendingPostFlushCbs，而不会放入 activePostFlushCbs
                    // 但是此时遍历 activePostFlushCbs 的 for 循环，所以这里 push 进入
                    // pendingPostFlushCbs，并不会在 for 循环中得到执行
                    // pendingPostFlushCbs 中的 cb
                    // 需要等到本次的 activePostFlushCbs 队列中 cb 全部执行完后，再执行，
                    // 就是移到当前执行的队列执行完后，再执行，不在本次队列中执行，不允许插队
                    pendingPostFlushCbs.push(...cb)
                  } else {
                    // 但是当 cb.id == -1, 时，只要有 activePostFlushCbs 则可以插队立即执行
                    if (activePostFlushCbs && cb.id === -1) {
                      // activePostFlushCbs 存在说明是属于执行中动态插入执行队列的，
                      // cb.id == -1, 表示直接插对优先级最高，直接插入到本次 job 后面，
                      // 即下一个就是执行这个插入的回调函数
                      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb)
                    } else if (!(cb.flags! & SchedulerJobFlags.QUEUED)) {
                      // 否则的话直接插入到 pendingPostFlushCbs 中，
                      // 注意这里不是插入到正在执行的队列 activePostFlushCbs 中，所以这里的插入需要等到
                      // 这里的 activePostFlushCbs 执行完后，再执行 flushJobs()
                      // 就是移到当前执行的队列执行完后，再执行，不在本次队列中执行，不允许插队
                      pendingPostFlushCbs.push(cb)
                      cb.flags! |= SchedulerJobFlags.QUEUED
                    }
                  }
                  queueFlush(){
                    if (currentFlushPromise) return
                  }
                }
                // cb 执行中，递归(调用自己)调用
                flushPostFlushCbs(){
                  if (pendingPostFlushCbs.length === 0) return
                  // 去重排序
                  const deduped = [...new Set(pendingPostFlushCbs)].sort( (a, b) => getId(a) - getId(b))
                  pendingPostFlushCbs.length = 0
                  // 递归调用，此时的 activePostFlushCbs 还没有执行到设置为 null
                  // 因为是递归调用，执行到一半，还未来得及将 activePostFlushCbs = null
                  // 就又开始从头开始执行了，注意这里的 activePostFlushCbs 是全局变量
                  if (activePostFlushCbs) {
                    // 若是这个存在，说明是递归调用，将 pendingPostFlushCbs 去重后的 cbs, 直接放入到
                    // activePostFlushCbs 最后面，等待 for 循环遍历执行，
                    // 然后直接 return 避免陷入无限递归调用
                    // 这里通过直接调用 flushPostFlushCbs() 本身 将 pendingPostFlushCbs 插入到
                    // activePostFlushCbs 进行一次执行，
                    // 后面一可以继续调用 flushPostFlushCbs() 来执行 挂起的 cb
                    activePostFlushCbs.push(...deduped)
                    return
                  }
                }
              }
              // 执行完后,去掉 QUEUED 标识
              cb.flags! &= ~SchedulerJobFlags.QUEUED
            }
            // 执行结束清空 activePostFlushCbs，但是若是递归调用，那么
            // activePostFlushCbs， postFlushIndex 此时不会得到清空，
            // 在递归调用中可以判断 activePostFlushCbs 不为 null
            activePostFlushCbs = null
            postFlushIndex = 0
          }

            // 是否应放在 flushJobs() 后面，即函数最后，否则这里在 调用 flushJobs() 将
            // currentFlushPromise 置为 null，会导致 flushJobs() 中的 queueJob(job) 时执行
            // queueFlush() 创建新的 currentFlushPromise = resolvedPromise.then(flushJobs)
            // 从而让 flushJobs() 中的  queueJob 执行开新的异步执行 ？
            // 或者这里是故意的 ???
            // 在最后执行 flushJobs() 前，将 currentFlushPromise 置为 null
            // 让后面执行的 queueJob(job) 在下一个异步中执行 ？
            currentFlushPromise = null

            // 这里的 queue.length > 0 只有可能是在 flushPostFlushCbs(seen)中 添加了任务
            // 因为执行 flushPostFlushCbs(seen)前, 清空了 queue.length = 0
            // If new jobs have been added to either queue, keep flushing
            if (queue.length || pendingPostFlushCbs.length) {
              // 这里为何不调用 queueFlush() ?
              // 因为 前面的 currentFlushPromise 置为了 null， 若是这里调用 queueFlush()
              // 就会开启一个新的异步执行 flushJobs，就不是同步了，而这里必须保证 flushJobs() 是同步的
              // 所以这里同步调用 flushJobs(), 确保基于 resolvedPromise.then(flushJobs) 开始的异步执行
              // 必须等待 flushJobs() 执行完后才能 resolve, 若是调用 queueFlush()，则会调用
              // resolvedPromise.then(flushJobs) 开启另一个异步 promise, 导致这里的提前结束，而不是同步等待
              // flushJobs() 结束
              // currentFlushPromise = resolvedPromise.then(flushJobs() {
              //   递归调用自己，直到 flushJobs 执行结束，这里的 currentFlushPromise.then() 才 resolve
              //   这样基于 currentFlushPromise 的 nextTick(fn) 中 fn 才会执行
              //   即 nextTick(fn) 的异步执行，必须是等 flushJobs() 执行完后才会得到执行，
              //   同时在 flushJobs 中执行自己只能同步执行，而不可异步执行，
              //   所以这就是这里没有调用 queueFlush() 的原因，而是同步的递归执行 flushJobs()
              //   flushJobs()
              // })
              flushJobs() {
                try {
                  for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
                    // ...
                    // 此时在这里执行，有个特点就是 currentFlushPromise = null
                    // 此时这里面若是调用 nextTick(fn) 则是执行 resolvedPromise.then(fn)
                    const job = queue[flushIndex]
                    job(){
                      queueJob(job) {
                        if ((job.flags! & SchedulerJobFlags.QUEUED)) return
                        const jobId = getId(job) // number or Infinity
                        queue.splice(findInsertionIndex(jobId), 0, job)
                        job.flags! |= SchedulerJobFlags.QUEUED
                        queueFlush() {
                          // 此时的 currentFlushPromise = null
                          if (currentFlushPromise) return
                          // 此时则会开启一个新的异步执行流
                          currentFlushPromise = resolvedPromise.then(flushJobs() {
                            // ... 此时这里面异步执行，不会阻塞这里的 job 执行
                          })
                        }
                      }
                      // ...
                    }
                  }
                } finally {
                  flushIndex = -1
                  queue.length = 0
                  flushPostFlushCbs() {
                    // ...
                    if (pendingPostFlushCbs.length === 0) return
                  }
                }
            }
          }
        })
      }
    }
  }
}
```
