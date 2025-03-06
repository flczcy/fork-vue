import { ErrorCodes, callWithErrorHandling, handleError } from './errorHandling'
import { NOOP, isArray } from '@vue/shared'
import { type ComponentInternalInstance, getComponentName } from './component'

export enum SchedulerJobFlags {
  QUEUED = 1 << 0,
  PRE = 1 << 1,
  /**
   * Indicates whether the effect is allowed to recursively trigger itself
   * when managed by the scheduler.
   *
   * By default, a job cannot trigger itself because some built-in method calls,
   * e.g. Array.prototype.push actually performs reads as well (#1740) which
   * can lead to confusing infinite loops.
   * https://github.com/vuejs/core/issues/1740
     setup() {
       const price = ref(10);
       const history = ref<array<string>>([]);
       const stoprecording = watcheffect(() => {
         // 这里的 push() 读取长度, 然后操作改变了长度触发 set, 继续执行这里的 effect, 然后有增加长度...
         history.value.push(`price changed to ${price.value}`);
       });
       // stop recording after 3 seconds
       settimeout(() => {
         stoprecording();
       }, 3000);
       return { price, history };
     }
   *
   * The allowed cases are component update functions and watch callbacks.
   * Component update functions may update child component props, which in turn
   * trigger flush: "pre" watch callbacks that mutates state that the parent
   * relies on (#1801). Watch callbacks doesn't track its dependencies so if it
   * triggers itself again, it's likely intentional and it is the user's
   * responsibility to perform recursive state mutation that eventually
   * stabilizes (#1727).
   */
  ALLOW_RECURSE = 1 << 2,
  DISPOSED = 1 << 3,
}

export interface SchedulerJob extends Function {
  id?: number
  /**
   * flags can technically be undefined, but it can still be used in bitwise
   * operations just like 0.
   */
  flags?: SchedulerJobFlags
  /**
   * Attached by renderer.ts when setting up a component's render effect
   * Used to obtain component information when reporting max recursive updates.
   */
  i?: ComponentInternalInstance
}

export type SchedulerJobs = SchedulerJob | SchedulerJob[]

const queue: SchedulerJob[] = []
let flushIndex = -1

const pendingPostFlushCbs: SchedulerJob[] = []
let activePostFlushCbs: SchedulerJob[] | null = null
let postFlushIndex = 0

const resolvedPromise = /*@__PURE__*/ Promise.resolve() as Promise<any>
let currentFlushPromise: Promise<void> | null = null

const RECURSION_LIMIT = 100
type CountMap = Map<SchedulerJob, number>

export function nextTick<T = void, R = void>(
  this: T,
  fn?: (this: T) => R,
): Promise<R | Awaited<R>> {
  const p = currentFlushPromise || resolvedPromise
  // 这里不同的 ts 版本会报错：
  // Type 'Promise<R | Awaited<R>>' is not assignable to type 'Promise<Awaited<R>>'.
  //   Type 'R | Awaited<R>' is not assignable to type 'Awaited<R>'.
  //     Type 'R' is not assignable to type 'Awaited<R>'.
  // type A<R = void> = Promise<R | Awaited<R>>
  // type B<R = void> = Promise<Awaited<R>>
  // type C<R = void> = Awaited<R>
  // let a: A = Promise.resolve() as Promise<any>
  // let b: B = a
  // let c: A = b
  // let d: C = undefined
  // let e: C<string> = ''
  // let f: C<Promise<string>> = ''
  // let g: B<string> = Promise.resolve('') as Promise<string | Awaited<string>>

  return fn ? p.then(this ? fn.bind(this) : fn) : p
}

// 二分查找,必须是顺序的
// _createCommentVNode("v-if", true) -> v-if 为 false, 会创建一个空的 vnode
// 2. 来自 parent 的更新, parent 更新函数执行 patch(childOld, Comment) - 表示 unmount
//    此时 child 组件直接卸载掉, 而 child 中 dep.set 出发的 update 函数可能还在队列中
//    在执行 patch(childOld, null) 中, 执行 unmount 函数中应该移除 队列中的 child.update 函数
//    packages/runtime-core/src/renderer.ts, 这里卸载时将队列中标识置为 DISPOSED, 后面在执行队列 flush 时
//    unmountComponent: job.flags! |= SchedulerJobFlags.DISPOSED
//    跳过该函数的执行
// Use binary-search to find a suitable position in the queue. The queue needs
// to be sorted in increasing order of the job ids. This ensures that:
// 1. Components are updated from parent to child. As the parent is always
//    created before the child it will always have a smaller id.
// 2. If a component is unmounted during a parent component's update, its update
//    can be skipped.
// 2. 这是因为组件在卸载时,会将 job.flags 设置上 DISPOSED, 故执行队列时, 会跳过 DISPOSED 的 job 的执行
// A pre watcher will have the same id as its component's update job. The
// watcher should be inserted immediately before the update job. This allows
// watchers to be skipped if the component is unmounted by the parent update.

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

// foo.a++ -> queueJob(updateFoo)
// foo.b++ -> queueJob(updateFoo)
// foo.c++ -> queueJob(updateFoo)
// ...
// bar.a++ -> queueJob(updateBar)
// bar.b++ -> queueJob(updateBar)
// bar.c++ -> queueJob(updateBar)
// ...
// queue: [updateFoo, updateBar]
// 在异步的执行 updateFoo 函数中 {
//   又会注册钩子函数到 pendingPostFlushCbs 中, 以等待 uddateFoo 等 queue 中的 job 执行完后再执行
//   queuePostFlushCb(hookFn)
// }

export function queueJob(job: SchedulerJob): void {
  // QUEUED 标识的任务已经被插入到队列中了, 不需要再次插入
  if (!(job.flags! & SchedulerJobFlags.QUEUED)) {
    const jobId = getId(job) // getId 中处理若是 job.id 不存在, 这里返回 Infinity
    const lastJob = queue[queue.length - 1]
    if (
      !lastJob ||
      // fast path when the job id is larger than the tail
      // fast path 种类可以理解为代码最优化执行路径, 其实就是优化代码执行
      // fast path 就是对代码的执行路径优化(代码有多种执行路径: 快速执行路径, 慢速执行路径, hot path, cold path)
      // 执行快速的路径就称之为 fast path
      // 代码术语还有 hot path, cold path, slow path, fast path
      (!(job.flags! & SchedulerJobFlags.PRE) && jobId >= getId(lastJob))
    ) {
      // 若是要插入的 id 大于或者等于队列最后一个，此时直接 push 到队列最后
      // 特别注意这里相等的情况(等于队列中最后一个，直接插入到队列最后面，不经过下面的二分查找插入)
      // 注意这里相等，若是使用下面的二分查找插入，则会插入到最后一个的前面，即倒数第 2 个而不是最后一个
      // 这里相等时的插入与下面的 二分查找插入 是有区分的
      queue.push(job)
    } else {
      // slow path
      // 注意这里的插入是从 flushIndex 开始插入, 前面执行过了的 job, 不再考虑
      // flushIndex 表示当前正在执行的那个 job 再 queue 中所在的索引
      // 不是每次都从头开始查找插入的
      queue.splice(findInsertionIndex(jobId), 0, job)
    }

    job.flags! |= SchedulerJobFlags.QUEUED

    queueFlush()
  }
}

function queueFlush() {
  if (!currentFlushPromise) {
    // 第一次一个同步操作, 注册一个异步回调函数函数等待同步操作结束
    // 第二次, 3, 4, 的同步操作通过 currentFlushPromise 进行拦截, 不再注册异步回调函数
    // 等所有的同步操作执行完后, 开始执行异步操作 flushJobs
    // 这里的 currentFlushPromise 的resolve 要等到 flushJobs 执行完后才 resolve
    // 也就是 currentFlushPromise.then(fn) 中的 fn 要等到 flushJobs 执行完后才会执行
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}

export function queuePostFlushCb(cb: SchedulerJobs): void {
  if (!isArray(cb)) {
    // cb 不是数组
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb)
    } else if (!(cb.flags! & SchedulerJobFlags.QUEUED)) {
      pendingPostFlushCbs.push(cb)
      cb.flags! |= SchedulerJobFlags.QUEUED
    }
  } else {
    // 如果 cb 是一个数组，它是一个组件生命周期钩子，只能由一个已经在主队列中去重的任务触发，
    // 因此我们可以在这种情况下跳过重复检查以提高性能
    // if cb is an array, it is a component lifecycle hook which can only be
    // triggered by a job, which is already deduped(去重的) in the main queue, so
    // we can skip duplicate check here to improve perf
    // 也就是说调用 queuePostFlushCb 函数执行到这里, 说明 queuePostFlushCb 是由 queue 中的 job 触发的
    // 在 queue 中的 job (组件更新函数) 在处理生命周期钩子时 push 到数组时, 已经去重了, 所以我们可以跳过重复检查
    pendingPostFlushCbs.push(...cb)
  }
  queueFlush()
}

// 执行 queue 中的 所有的带有 PRE 标识的 job, 执行完后从队列中移除该函数
export function flushPreFlushCbs(
  instance?: ComponentInternalInstance,
  seen?: CountMap,
  // skip the current job
  i: number = flushIndex + 1,
  // 这里 flushIndex 的初始值为 -1，所以即使这里不在 queue job 执行里面调用也是可以的
  // 1. job 外部调用，那么此时的 flushIndex 为 -1，这里再 +1 就是 0 也不会导致数组越界
  // 2. job 内部调用，此时的 flushIndex 就是当前正在执行的 job 在队列中的 index，所以这里 + 1
  //    表示从下一个 job 开始逐个查找 PRE 标识的 job 进行同步执行
  //    此时会阻塞当前正在执行的 job, 直到队列中所有的 job.PRE 执行完毕后，才会继续往下执行当前 job
  //    同时注意 job.PRE 执行完一次后就会从队列中移除
): void {
  if (__DEV__) {
    seen = seen || new Map()
  }
  for (; i < queue.length; i++) {
    const cb = queue[i]
    if (cb && cb.flags! & SchedulerJobFlags.PRE) {
      if (instance && cb.id !== instance.uid) {
        continue
      }
      if (__DEV__ && checkRecursiveUpdates(seen!, cb)) {
        continue
      }
      queue.splice(i, 1)
      i--
      if (cb.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
        cb.flags! &= ~SchedulerJobFlags.QUEUED
      }
      cb()
      if (!(cb.flags! & SchedulerJobFlags.ALLOW_RECURSE)) {
        cb.flags! &= ~SchedulerJobFlags.QUEUED
      }
    }
  }
}

export function flushPostFlushCbs(seen?: CountMap): void {
  if (pendingPostFlushCbs.length) {
    // 去重排序
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b),
    )
    pendingPostFlushCbs.length = 0

    // #1947 already has active queue, nested flushPostFlushCbs call
    if (activePostFlushCbs) {
      // 递归调用直接返回, 避免循环递归,
      // cb() { flushPostFlushCbs(cb) }
      // 进入到这里说明 pendingPostFlushCbs.length > 0, 又有新的 cb 被注册到 pendingPostFlushCbs 中
      // 因为之前进入后, pendingPostFlushCbs.length = 0 已被设置为 0, 若是再次调用 flushPostFlushCbs
      // 进入到这里, 说明 pendingPostFlushCbs 中有被注册值, 若是没有值, 则不会执行到这里
      // 所以这里需要将其 push 到 activePostFlushCbs 中
      activePostFlushCbs.push(...deduped)
      return
    }

    activePostFlushCbs = deduped
    if (__DEV__) {
      seen = seen || new Map()
    }

    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      const cb = activePostFlushCbs[postFlushIndex]
      if (__DEV__ && checkRecursiveUpdates(seen!, cb)) {
        continue
      }
      if (cb.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
        cb.flags! &= ~SchedulerJobFlags.QUEUED
      }
      // 若是没有 DISPOSED 标识, 则执行 cb
      if (!(cb.flags! & SchedulerJobFlags.DISPOSED)) cb()
      // 执行完后,去掉 QUEUED 标识
      cb.flags! &= ~SchedulerJobFlags.QUEUED
    }
    activePostFlushCbs = null
    postFlushIndex = 0
  }
}

const getId = (job: SchedulerJob): number =>
  // 若是没有 id, 但是是有 PRE，那么读取的 id 为 -1，否则返回 Infinity
  // 这里要注意，有 PRE 标识的 job id 默认值为 -1，而不是 infinite
  job.id == null ? (job.flags! & SchedulerJobFlags.PRE ? -1 : Infinity) : job.id

function flushJobs(seen?: CountMap) {
  if (__DEV__) {
    // 这里只需要在开发环境给 seen 赋值即可, 产品环境不会调用 checkRecursiveUpdates(seen) 函数
    // 所以在开发环境中, seen 是一定有值的
    seen = seen || new Map()
  }

  // must be determined out of 必须从...之外来决定”
  // conditional usage of checkRecursiveUpdate must be determined out of
  // try ... catch block since Rollup by default de-optimizes treeshaking
  // inside try-catch. This can leave all warning code unshaked. Although
  // they would get eventually shaken by a minifier like terser, some minifiers
  // would fail to do that (e.g. https://github.com/evanw/esbuild/issues/1610)
  // 必须在 try...catch 块之外确定 checkRecursiveUpdate 的条件使用，
  // 因为 Rollup 默认会对 try...catch 块内的代码进行反优化（de-optimize），
  //  然而，Rollup 默认会对 try...catch 块内的代码进行反优化，这意味着即使这些代码在某些条件下不会被执行，
  //  它们也不会被 tree shaking 掉。
  // 这会导致所有警告代码无法被 tree shaking。尽管这些代码最终会被像 terser 这样的压缩工具
  // 摇树（shake）掉，但有些压缩工具可能会失败（例如：https://github.com/evanw/esbuild/issues/1610）
  const check = __DEV__
    ? (job: SchedulerJob) => checkRecursiveUpdates(seen!, job)
    : NOOP

  try {
    // NOTE:这里的 flushIndex 是全局变量, 但是每一次调用执行本函数到这里的for中,会将 flushIndex 重置为 0
    // 这里的 queue.length 是实时读取了,若是 job() 添加了任务, 则 queue.length 反应到这里
    // 比如执行 到 flushIndex = 3 是, 摸个 job 函数内部 queueJob(job) 插入了一个新的 job
    // 注意此时 是从 flushIndex 当值开始插入, 应为 flushIndex 是全局变量, 在 queueJob 中读取 flushIndex
    // [1, 2, 3, 4, 5, 6]
    //        |
    //        flushIndex = 3
    //        |[3, 4, 5, 6] 后面进行插入, 而不会插入到 3 的前面
    // 同时要注意插入的新的 job 的 id 一定是大于或者等于当前 job 的 id
    // 因为子函数在父函数后面执行, 后面执行的函数的 id 大于等于前面的函数的 id
    // 若是设置 ALLOW_RECURSE, 则可以在执行 job 时, 插入自己本身到 queue 中
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      // job 没有 DISPOSED 标识, 表示没有被废弃
      if (job && !(job.flags! & SchedulerJobFlags.DISPOSED)) {
        // checkRecursiveUpdates 给这里的 job 函数执行计数, 若是执行超过次数后,
        // 开发环境中这里直接返回不在进行计数了, 但是会提示递归执行警告
        // 提前 continue, 结束无限递归执行, 这里只是在开发环境中启用, 不在生产环境中使用
        // 生成环境则会无限递归执行
        if (__DEV__ && check(job)) {
          continue
        }
        if (job.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
          // 若是这里 job 函数允许递归(自己调用自己)执行, 则去掉 QUEUED 标识
          // 以便让 job() 函数中继续调用 job() 函数自己
          // job() {
          //   job() // 递归调用
          // }
          job.flags! &= ~SchedulerJobFlags.QUEUED
        }
        // job() 此处执行 job() 函数
        callWithErrorHandling(
          job,
          job.i,
          job.i ? ErrorCodes.COMPONENT_UPDATE : ErrorCodes.SCHEDULER,
        )
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
    // 注意 queue 中的 任务都是 组件的 effect 更新函数
    flushIndex = -1
    queue.length = 0

    // 以上 queue 中的任务(组件effect update 函数)都执行完毕
    // 此时开始执行 postFlushCbs 就是组件注册的钩子函数放在组件的更新函数执行完后执行
    flushPostFlushCbs(seen)

    // currentFlushPromise = resolvedPromise.then(flushJobs)
    //   queue.job()
    //   pendingPostFlushCbs.job()
    //   这些任务执行都是在 currentFlushPromise 上下文中
    //   组件的 effect 更新函数中 可以访问到 currentFlushPromise
    //   组件的 hooks  中可以访问到 currentFlushPromise
    //   比如组件的 onMounted(){ nextTick() }
    //   这里的 nextTick 函数内部会调用 resolvedPromise.then(flushJobs) }
    // currentFlushPromise = nulli

    currentFlushPromise = null
    // 这里的 queue.length > 0 只有可能是在 flushPostFlushCbs(seen)中 添加了任务
    // 因为执行 flushPostFlushCbs(seen)前, 清空了 queue.length = 0
    // If new jobs have been added to either queue, keep flushing
    if (queue.length || pendingPostFlushCbs.length) {
      // 前面的 currentFlushPromise 置为了 null
      flushJobs(seen)
    }
  }
}

function checkRecursiveUpdates(seen: CountMap, fn: SchedulerJob) {
  const count = seen.get(fn) || 0
  if (count > RECURSION_LIMIT) {
    const instance = fn.i
    const componentName = instance && getComponentName(instance.type)
    handleError(
      `Maximum recursive updates exceeded${
        componentName ? ` in component <${componentName}>` : ``
      }. ` +
        `This means you have a reactive effect that is mutating its own ` +
        `dependencies and thus recursively triggering itself. Possible sources ` +
        `include component template, render function, updated hook or ` +
        `watcher source function.`,
      null,
      ErrorCodes.APP_ERROR_HANDLER,
    )
    return true
  }
  seen.set(fn, count + 1)
  return false
}
