import { extend, hasChanged } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import type { TrackOpTypes, TriggerOpTypes } from './constants'
import { type Link, globalVersion } from './dep'
import { activeEffectScope } from './effectScope'
import { warn } from './warning'

export type EffectScheduler = (...args: any[]) => any

export type DebuggerEvent = {
  effect: Subscriber
} & DebuggerEventExtraInfo

export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

export interface ReactiveEffectOptions extends DebuggerOptions {
  scheduler?: EffectScheduler
  allowRecurse?: boolean
  onStop?: () => void
}

export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

export let activeSub: Subscriber | undefined

export enum EffectFlags {
  /**
   * ReactiveEffect only
   */
  ACTIVE = 1 << 0,
  RUNNING = 1 << 1,
  TRACKING = 1 << 2,
  NOTIFIED = 1 << 3,
  DIRTY = 1 << 4,
  ALLOW_RECURSE = 1 << 5,
  PAUSED = 1 << 6,
}

/**
 * Subscriber is a type that tracks (or subscribes to) a list of deps.
 */
export interface Subscriber extends DebuggerOptions {
  /**
   * Head of the doubly linked list representing the deps
   * @internal
   */
  deps?: Link
  /**
   * Tail of the same list
   * @internal
   */
  depsTail?: Link
  /**
   * @internal
   */
  flags: EffectFlags
  /**
   * @internal
   */
  next?: Subscriber
  /**
   * returning `true` indicates it's a computed that needs to call notify
   * on its dep too
   * @internal
   */
  notify(): true | void
}

const pausedQueueEffects = new WeakSet<ReactiveEffect>()

export class ReactiveEffect<T = any>
  implements Subscriber, ReactiveEffectOptions
{
  /**
   * @internal
   * 每一个 sub 对应多个 dep, 这里的 deps 指向该 sub 中第一个 dep
   * [dep, dep, dep]
   *  |<-deps
   *            |-depsTail
   */
  deps?: Link = undefined
  /**
   * @internal
   */
  depsTail?: Link = undefined
  /**
   * @internal
   */
  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING
  /**
   * @internal
   */
  next?: Subscriber = undefined
  /**
   * @internal
   */
  cleanup?: () => void = undefined

  scheduler?: EffectScheduler = undefined
  onStop?: () => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void

  constructor(public fn: () => T) {
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this)
    }
  }

  pause(): void {
    this.flags |= EffectFlags.PAUSED
  }

  resume(): void {
    if (this.flags & EffectFlags.PAUSED) {
      this.flags &= ~EffectFlags.PAUSED
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this)
        this.trigger()
      }
    }
  }

  /**
   * @internal
   */
  notify(): void {
    if (
      this.flags & EffectFlags.RUNNING &&
      !(this.flags & EffectFlags.ALLOW_RECURSE)
    ) {
      return
    }
    if (!(this.flags & EffectFlags.NOTIFIED)) {
      batch(this)
    }
  }

  run(): T {
    // TODO cleanupEffect

    if (!(this.flags & EffectFlags.ACTIVE)) {
      // stopped during cleanup
      return this.fn()
    }

    this.flags |= EffectFlags.RUNNING
    cleanupEffect(this)
    prepareDeps(this)
    const prevEffect = activeSub
    const prevShouldTrack = shouldTrack
    activeSub = this
    shouldTrack = true

    try {
      return this.fn()
    } finally {
      if (__DEV__ && activeSub !== this) {
        warn(
          'Active effect was not restored correctly - ' +
            'this is likely a Vue internal bug.',
        )
      }
      cleanupDeps(this)
      activeSub = prevEffect
      shouldTrack = prevShouldTrack
      this.flags &= ~EffectFlags.RUNNING
    }
  }

  stop(): void {
    if (this.flags & EffectFlags.ACTIVE) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link)
      }
      this.deps = this.depsTail = undefined
      cleanupEffect(this)
      this.onStop && this.onStop()
      this.flags &= ~EffectFlags.ACTIVE
    }
  }

  trigger(): void {
    if (this.flags & EffectFlags.PAUSED) {
      pausedQueueEffects.add(this)
    } else if (this.scheduler) {
      // 若是有 scheduler 则不需要判断 isDirty(this)
      this.scheduler()
    } else {
      this.runIfDirty()
    }
  }

  /**
   * @internal
   */
  runIfDirty(): void {
    if (isDirty(this)) {
      this.run()
    }
  }

  get dirty(): boolean {
    return isDirty(this)
  }
}

/**
 * For debugging
 */
// function printDeps(sub: Subscriber) {
//   let d = sub.deps
//   let ds = []
//   while (d) {
//     ds.push(d)
//     d = d.nextDep
//   }
//   return ds.map(d => ({
//     id: d.id,
//     prev: d.prevDep?.id,
//     next: d.nextDep?.id,
//   }))
// }

let batchDepth = 0
let batchedSub: Subscriber | undefined
let batchedComputed: Subscriber | undefined

export function batch(sub: Subscriber, isComputed = false): void {
  sub.flags |= EffectFlags.NOTIFIED
  if (isComputed) {
    sub.next = batchedComputed
    batchedComputed = sub
    return
  }
  sub.next = batchedSub
  batchedSub = sub
}

/**
 * @internal
 */
export function startBatch(): void {
  batchDepth++
}

// 这里要成对调用
// startBatch() // ++
//   batch(sub)
//   startBatch() // ++
//   batch(sub)
//   // ... 执行其他代码
//   endBatch() { // -- 这里只执行了一次 -- , 而前面有两次 ++ 所有 batchDepth 大于 0
//     // 这里这里嵌套的 endBatch 不会执行,直接 return 因为 --batchDepth 依然大于 0
//   }
//   // 只有最后一个 endBatch 才会执行
// endBatch()

/**
 * Run batched effects when all batches have ended
 * @internal
 */
export function endBatch(): void {
  if (--batchDepth > 0) {
    return
  }

  if (batchedComputed) {
    let e: Subscriber | undefined = batchedComputed
    batchedComputed = undefined
    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED
      e = next
    }
  }

  let error: unknown
  while (batchedSub) {
    let e: Subscriber | undefined = batchedSub
    batchedSub = undefined
    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED
      if (e.flags & EffectFlags.ACTIVE) {
        try {
          // ACTIVE flag is effect-only
          ;(e as ReactiveEffect).trigger()
        } catch (err) {
          if (!error) error = err
        }
      }
      e = next
    }
  }

  if (error) throw error
}

function prepareDeps(sub: Subscriber) {
  // Prepare deps for tracking, starting from the head
  for (let link = sub.deps; link; link = link.nextDep) {
    // set all previous deps' (if any) version to -1 so that we can track
    // which ones are unused after the run
    link.version = -1
    // // sub1
    // effect(() => {
    //   track('foo.bar') // 第一次 get, 创建 dep, 并且执行 dep.track(), 创建 link, dep.activeLink = link
    //   track('foo.bar') // 第二次 get, 不在重复创建 dep, 但是执行 dep.track() 同一个 dep, 同一个 activeSub 无需更改 dep.activeLink
    //                    // 同时这里也保证了去掉重复的 dep track
    // })
    // // sub2
    // effect(() => {
    //   track('foo.bar') // 第三次 get, 不在重复创建 dep. dep.track(), dep.activeLink 不为 undfined, sub 不同了, 此时需要创建新的 link
    //                    // 作为当前 dep 的 activeLink, 也就是 dep 在不同的 sub 中, 需要创建不同的 link 作为 dep.activeLink
    //   track('foo.bar') // 第四次 get, dep 已经存在,不重复创建, dep.activeLink,也存在,还是同一个 activeSub, 无需更改 dep.activeLink
    //                    // 同时这里也保证了去掉重复的 dep track
    // })
    // [sub1, sub2]
    // 同一个 dep 的 link 的 link.dep.activeLink -> sub2
    // 而现在是 sub1 的 run 中, 所以这里需要把这个 link 之前所指向的在 sub2 上下文中 activeLink 保存起来
    // 同时更新当前 dep link 的 activeLink 为当前 sub1 执行上下中的 link
    // 后面当在 sub2 中的 run 执行时, 需要把在之前 sub1 执行的 activeLink 保存起来,
    // 这里更新当前 dep link 的 activeLink 为当前 sub2 执行上下中的 link
    // 这里主要是用于嵌套执行的回复, link.dep.activeLink 在不同的 sub 中执行, 其 link.dep.activeLink 需要指向当前
    // 这是因为 link.dep 是同一个, 但是在不同 sub 中执行, 当执行完后一个 sub 后, 其 link.dep.activeLink 指向的则是当前执行的sub中link
    // 当 link.dep 在其他的 sub 中执行时, 应该把 link.dep.activeLink 设置为当前 sub 中创建的那个 link
    // 执行 sub 中的那个 link
    // effect() {
    //   // 以下注意, 只有 dep 是不变的, dep.activeLink 在不同的 sub 中是不断变化的
    //   // link(dep, sub) 是有 dep, sub 决定的, 只有 dep, sub 都相同时, 才是同一个 link
    //   // dep 相同, sub 不同, 则不是同一个 link,
    //   dep.link1 -> link1.dep.activeLink = link1
    //   effect() {
    //     // 先保存 dep 上次的 activeLink
    //     // link2.prevActiveLink = link2.dep.activeLink
    //     dep.link2 -> link2.dep.activeLink = link2
    //     // 执行完后需要把 这里列 link2.dep.activeLink = link1
    //     link2.dep.activeLink = link2.prevActiveLink
    //   }
    //   dep.link1()
    // }
    // store previous active sub if link was being used in another context
    link.prevActiveLink = link.dep.activeLink
    link.dep.activeLink = link
    // 在 sub 中执行完后, 需要还原回去,用于嵌套
    // linkk.dep.activeLink = link.prevActiveLink
    // link.prevActiveLink = undefined
  }
}

function cleanupDeps(sub: Subscriber) {
  // Cleanup unsued deps
  let head
  let tail = sub.depsTail
  let link = tail
  while (link) {
    const prev = link.prevDep
    if (link.version === -1) {
      if (link === tail) tail = prev
      // unused - remove it from the dep's subscribing effect list
      removeSub(link)
      // also remove it from this effect's dep list
      removeDep(link)
    } else {
      // The new head is the last node seen which wasn't removed
      // from the doubly-linked list
      head = link
    }

    // restore previous active link if any
    link.dep.activeLink = link.prevActiveLink
    link.prevActiveLink = undefined
    link = prev
  }
  // set the new head & tail
  sub.deps = head
  sub.depsTail = tail
}

function isDirty(sub: Subscriber): boolean {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (
      link.dep.version !== link.version ||
      (link.dep.computed &&
        (refreshComputed(link.dep.computed) ||
          link.dep.version !== link.version))
    ) {
      return true
    }
  }
  // @ts-expect-error only for backwards compatibility where libs manually set
  // this flag - e.g. Pinia's testing module
  if (sub._dirty) {
    return true
  }
  return false
}

/**
 * Returning false indicates the refresh failed
 * @internal
 */
export function refreshComputed(computed: ComputedRefImpl): undefined {
  if (
    computed.flags & EffectFlags.TRACKING &&
    !(computed.flags & EffectFlags.DIRTY)
  ) {
    return
  }
  computed.flags &= ~EffectFlags.DIRTY

  // Global version fast path when no reactive changes has happened since
  // last refresh.
  if (computed.globalVersion === globalVersion) {
    return
  }
  computed.globalVersion = globalVersion

  const dep = computed.dep
  computed.flags |= EffectFlags.RUNNING
  // In SSR there will be no render effect, so the computed has no subscriber
  // and therefore tracks no deps, thus we cannot rely on the dirty check.
  // Instead, computed always re-evaluate and relies on the globalVersion
  // fast path above for caching.
  if (
    dep.version > 0 &&
    !computed.isSSR &&
    computed.deps &&
    !isDirty(computed)
  ) {
    computed.flags &= ~EffectFlags.RUNNING
    return
  }

  const prevSub = activeSub
  const prevShouldTrack = shouldTrack
  activeSub = computed
  shouldTrack = true

  try {
    prepareDeps(computed)
    const value = computed.fn(computed._value)
    if (dep.version === 0 || hasChanged(value, computed._value)) {
      computed._value = value
      dep.version++
    }
  } catch (err) {
    dep.version++
    throw err
  } finally {
    activeSub = prevSub
    shouldTrack = prevShouldTrack
    cleanupDeps(computed)
    computed.flags &= ~EffectFlags.RUNNING
  }
}

function removeSub(link: Link, soft = false) {
  const { dep, prevSub, nextSub } = link
  if (prevSub) {
    prevSub.nextSub = nextSub
    link.prevSub = undefined
  }
  if (nextSub) {
    nextSub.prevSub = prevSub
    link.nextSub = undefined
  }
  if (__DEV__ && dep.subsHead === link) {
    // was previous head, point new head to next
    dep.subsHead = nextSub
  }

  if (dep.subs === link) {
    // was previous tail, point new tail to prev
    dep.subs = prevSub

    if (!prevSub && dep.computed) {
      // if computed, unsubscribe it from all its deps so this computed and its
      // value can be GCed
      dep.computed.flags &= ~EffectFlags.TRACKING
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        // here we are only "soft" unsubscribing because the computed still keeps
        // referencing the deps and the dep should not decrease its sub count
        removeSub(l, true)
      }
    }
  }

  if (!soft && !--dep.sc && dep.map) {
    // #11979
    // property dep no longer has effect subscribers, delete it
    // this mostly is for the case where an object is kept in memory but only a
    // subset of its properties is tracked at one time
    dep.map.delete(dep.key)
  }
}

function removeDep(link: Link) {
  const { prevDep, nextDep } = link
  if (prevDep) {
    prevDep.nextDep = nextDep
    link.prevDep = undefined
  }
  if (nextDep) {
    nextDep.prevDep = prevDep
    link.nextDep = undefined
  }
}

export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner<T> {
  if ((fn as ReactiveEffectRunner).effect instanceof ReactiveEffect) {
    fn = (fn as ReactiveEffectRunner).effect.fn
  }

  const e = new ReactiveEffect(fn)
  if (options) {
    extend(e, options)
  }
  try {
    e.run()
  } catch (err) {
    e.stop()
    throw err
  }
  const runner = e.run.bind(e) as ReactiveEffectRunner
  runner.effect = e
  return runner
}

/**
 * Stops the effect associated with the given runner.
 *
 * @param runner - Association with the effect to stop tracking.
 */
export function stop(runner: ReactiveEffectRunner): void {
  runner.effect.stop()
}

/**
 * @internal
 */
export let shouldTrack = true
const trackStack: boolean[] = []

/**
 * Temporarily pauses tracking.
 */
export function pauseTracking(): void {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

/**
 * Re-enables effect tracking (if it was paused).
 */
export function enableTracking(): void {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

/**
 * Resets the previous global effect tracking state.
 */
export function resetTracking(): void {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

/**
 * Registers a cleanup function for the current active effect.
 * The cleanup function is called right before the next effect run, or when the
 * effect is stopped.
 *
 * Throws a warning if there is no current active effect. The warning can be
 * suppressed by passing `true` to the second argument.
 *
 * @param fn - the cleanup function to be registered
 * @param failSilently - if `true`, will not throw warning when called without
 * an active effect.
 */
export function onEffectCleanup(fn: () => void, failSilently = false): void {
  if (activeSub instanceof ReactiveEffect) {
    activeSub.cleanup = fn
  } else if (__DEV__ && !failSilently) {
    warn(
      `onEffectCleanup() was called when there was no active effect` +
        ` to associate with.`,
    )
  }
}

function cleanupEffect(e: ReactiveEffect) {
  const { cleanup } = e
  e.cleanup = undefined
  if (cleanup) {
    // run cleanup without active effect
    const prevSub = activeSub
    activeSub = undefined
    try {
      cleanup()
    } finally {
      activeSub = prevSub
    }
  }
}
