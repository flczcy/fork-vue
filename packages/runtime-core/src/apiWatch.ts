import {
  type WatchOptions as BaseWatchOptions,
  type DebuggerOptions,
  type ReactiveMarker,
  type WatchCallback,
  type WatchEffect,
  type WatchHandle,
  type WatchSource,
  watch as baseWatch,
} from '@vue/reactivity'
import { type SchedulerJob, SchedulerJobFlags, queueJob } from './scheduler'
import { EMPTY_OBJ, NOOP, extend, isFunction, isString } from '@vue/shared'
import {
  type ComponentInternalInstance,
  currentInstance,
  isInSSRComponentSetup,
  setCurrentInstance,
} from './component'
import { callWithAsyncErrorHandling } from './errorHandling'
import { queuePostRenderEffect } from './renderer'
import { warn } from './warning'
import type { ObjectWatchOptionItem } from './componentOptions'
import { useSSRContext } from './helpers/useSsrContext'

export type {
  WatchHandle,
  WatchStopHandle,
  WatchEffect,
  WatchSource,
  WatchCallback,
  OnCleanup,
} from '@vue/reactivity'

type MaybeUndefined<T, I> = I extends true ? T | undefined : T

type MapSources<T, Immediate> = {
  [K in keyof T]: T[K] extends WatchSource<infer V>
    ? MaybeUndefined<V, Immediate>
    : T[K] extends object
      ? MaybeUndefined<T[K], Immediate>
      : never
}

export interface WatchEffectOptions extends DebuggerOptions {
  flush?: 'pre' | 'post' | 'sync'
}

export interface WatchOptions<Immediate = boolean> extends WatchEffectOptions {
  immediate?: Immediate
  deep?: boolean | number
  once?: boolean
}

// Simple effect.
export function watchEffect(
  effect: WatchEffect,
  options?: WatchEffectOptions,
): WatchHandle {
  return doWatch(effect, null, options)
}

export function watchPostEffect(
  effect: WatchEffect,
  options?: DebuggerOptions,
): WatchHandle {
  return doWatch(
    effect,
    null,
    __DEV__ ? extend({}, options as any, { flush: 'post' }) : { flush: 'post' },
  )
}

export function watchSyncEffect(
  effect: WatchEffect,
  options?: DebuggerOptions,
): WatchHandle {
  return doWatch(
    effect,
    null,
    __DEV__ ? extend({}, options as any, { flush: 'sync' }) : { flush: 'sync' },
  )
}

export type MultiWatchSources = (WatchSource<unknown> | object)[]

// overload: single source + cb
export function watch<T, Immediate extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, MaybeUndefined<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchHandle

// overload: reactive array or tuple of multiple sources + cb
export function watch<
  T extends Readonly<MultiWatchSources>,
  Immediate extends Readonly<boolean> = false,
>(
  sources: readonly [...T] | T,
  cb: [T] extends [ReactiveMarker]
    ? WatchCallback<T, MaybeUndefined<T, Immediate>>
    : WatchCallback<MapSources<T, false>, MapSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchHandle

// overload: array of multiple sources + cb
export function watch<
  T extends MultiWatchSources,
  Immediate extends Readonly<boolean> = false,
>(
  sources: [...T],
  cb: WatchCallback<MapSources<T, false>, MapSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchHandle

// overload: watching reactive object w/ cb
export function watch<
  T extends object,
  Immediate extends Readonly<boolean> = false,
>(
  source: T,
  cb: WatchCallback<T, MaybeUndefined<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchHandle

// implementation
export function watch<T = any, Immediate extends Readonly<boolean> = false>(
  source: T | WatchSource<T>,
  cb: any,
  options?: WatchOptions<Immediate>,
): WatchHandle {
  if (__DEV__ && !isFunction(cb)) {
    warn(
      `\`watch(fn, options?)\` signature has been moved to a separate API. ` +
        `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` +
        `supports \`watch(source, cb, options?) signature.`,
    )
  }
  return doWatch(source as any, cb, options)
}

function doWatch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb: WatchCallback | null,
  options: WatchOptions = EMPTY_OBJ,
): WatchHandle {
  const { immediate, deep, flush, once } = options

  if (__DEV__ && !cb) {
    if (immediate !== undefined) {
      warn(
        `watch() "immediate" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`,
      )
    }
    if (deep !== undefined) {
      warn(
        `watch() "deep" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`,
      )
    }
    if (once !== undefined) {
      warn(
        `watch() "once" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`,
      )
    }
  }

  const baseWatchOptions: BaseWatchOptions = extend({}, options)

  if (__DEV__) baseWatchOptions.onWarn = warn

  // immediate watcher or watchEffect
  const runsImmediately = (cb && immediate) || (!cb && flush !== 'post')
  let ssrCleanup: (() => void)[] | undefined
  if (__SSR__ && isInSSRComponentSetup) {
    if (flush === 'sync') {
      const ctx = useSSRContext()!
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = [])
    } else if (!runsImmediately) {
      const watchStopHandle = () => {}
      watchStopHandle.stop = NOOP
      watchStopHandle.resume = NOOP
      watchStopHandle.pause = NOOP
      // 这里在 SSR 中, 直接返回, 结束 watch 函数
      return watchStopHandle
    }
  }

  const instance = currentInstance
  baseWatchOptions.call = (fn, type, args) =>
    callWithAsyncErrorHandling(fn, instance, type, args)

  // setup() {
  //   watch 是在 setup 函数中调用
  //   watch(() => foo.a, cb)
  //   每一次的 dep.set 都会触发
  //   dep.trigger() -> e.trigger -> e.scheduler() = {
  //      baseWatchOptions.scheduler(job, false) {
  //        if(flush === 'post') {
  //          queuePostFlushCb(job)
  //        } else if(flush !== 'sync'){
  //          queueJob(job)
  //        }
  //      }
  //   }
  // }
  // watch 回调 cb 默认为 PRE, 即直接插入在当前的组件的 job 执行完后立即执行 watch 的 job,
  // 注意: 这里在 setup() 函数中执行的 watch(src, cb) 插入 的 cb.id 会将其设置为组件更新函数的id,
  // 即在当前 setup() 函数执行中的那个组件实例(currentInstance) 的 uid
  // 故在调用 queueJob(cb) 时, 插入的 cb.id 与 当前 job 执行时的 job.id 是相等的
  // 同时在一个 setup() 函数中, 可以一次执行多次 watch(src, cb2), watch(src, cb3),
  // 每执行一次, 就创建一个新的 effect, 初始化(setup)执行中时, 不会触发依赖, 这里的回到函数不会执行
  // 注意当第一次初始化时 会设置挂载等 hook, 但是这里的 watch 回调不会执行的
  // 初始化后, foo.a++ -> dep.trigger() 只有只变化后将, 才会执行这里的 queueJob()
  // queue: []
  // dep.trigger() -> 触发读个 sub 更新 -> 触发多次 queueJob(job)
  // 注意这里的 dep(foo) 先与 组件绑定 watch 的 effect
  // dep: [watchEffect1, watchEffect2, watchEffect3, componentEffect]
  // 故这里的 dep.trigger 先执行 w1.triger(), w2.trigger, w3.triger, com.trigger()
  // 同步执行: queueJob(w1), queueJob(w2), queueJob(w3), queueJob(com),
  // [watchFn1(PRE), watchFn2(PRE), watchFn3(PRE), comFn1, comFn2, watchFn2]
  // 故最后队列中 watch 的 cb 是在对应组件的 job 前面执行, 因为 dep 先被 watchEffect 收集
  // 所以最后更新是 watch 的回调在组件的更新函数前面执行.
  // 若是需要让 watch 回调函数在组件的更新函数后面执行, 那么需要在组件 setup() 函数中
  // 注册 watcher 时, 需要显式的传入参数 { flush: 'post'}
  // watch(src, cb, {flush: 'post'}) 或者使用等价的函数 watchPostEffect(src, cb)
  // 这样在 dep.trigger() 时, 在 watch 中则会执行 queuePostFlushCb(cb) 将 watch 的更新回调
  // 放入 pendingPostFlushCbs 中, 等待 queue 中的 job 都执行完后, 再去执行 pendingPostFlushCbs 的函数

  // scheduler
  let isPre = false
  if (flush === 'post') {
    baseWatchOptions.scheduler = job => {
      // queuePostFlushCb
      queuePostRenderEffect(job, instance && instance.suspense)
    }
  } else if (flush !== 'sync') {
    // default: 'pre'
    isPre = true
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job()
      } else {
        queueJob(job)
      }
    }
  }

  baseWatchOptions.augmentJob = (job: SchedulerJob) => {
    // important: mark the job as a watcher callback so that scheduler knows
    // it is allowed to self-trigger (#1727)
    if (cb) {
      // watchEffect 中 这里的 cb 为 null, 也就是在 watchEffec 中没有 ALLOW_RECURSE
      job.flags! |= SchedulerJobFlags.ALLOW_RECURSE
    }
    if (isPre) {
      job.flags! |= SchedulerJobFlags.PRE
      // 这里对于 watch(src, cb) 的 cb 执行顺序非常重要, 一般是 watch() 是在组件的 setup() 函数中执行的
      // 故 watch 一般是和组件绑定的, 一般是某个组件内 watch, 与当前组件的更新函数执行顺序绑定的
      // 所以这里的 watch(src, cb) 中 cb.id 必须等于组件的 uid, 也就是组件的更新函数(job.id)
      // 因为组件的 更新函数的 job.id 也是使用的组件的 uid, 这样我们在使用 queueJob(cb)时, 由于 id 与组件的
      // job.id 相同, 在插入执行队列时, 就可以插入在当前组件 job 函数的附近, 当当前组件的更新函数 job 函数执行
      // 完后, 可以继续执行当前组件中注册的 watch 回调函数, 这样就保证了顺序. 而不会是当前组件更新函数执行完后,
      // 直接执行下一个组件的更新, 却不会执行当前组件的 watch 函数, 导致在当前组件中注册的 watch 回调函数执行时机
      // 不对, 当前组件的 watch 函数, 就应该在当前组件的更新函数执行完后执行.
      if (instance) {
        job.id = instance.uid
        ;(job as SchedulerJob).i = instance
      }
    }
  }

  const watchHandle = baseWatch(source, cb, baseWatchOptions)

  if (__SSR__ && isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle)
    } else if (runsImmediately) {
      watchHandle()
    }
  }

  return watchHandle
}

// this.$watch
export function instanceWatch(
  this: ComponentInternalInstance,
  source: string | Function,
  value: WatchCallback | ObjectWatchOptionItem,
  options?: WatchOptions,
): WatchHandle {
  const publicThis = this.proxy as any
  const getter = isString(source)
    ? source.includes('.')
      ? createPathGetter(publicThis, source)
      : () => publicThis[source]
    : source.bind(publicThis, publicThis)
  let cb
  if (isFunction(value)) {
    cb = value
  } else {
    cb = value.handler as Function
    options = value
  }
  const reset = setCurrentInstance(this)
  const res = doWatch(getter, cb.bind(publicThis), options)
  reset()
  return res
}

export function createPathGetter(ctx: any, path: string) {
  const segments = path.split('.')
  return (): any => {
    let cur = ctx
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]]
    }
    return cur
  }
}
