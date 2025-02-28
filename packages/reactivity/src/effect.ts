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
   *  |
   *  deps
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

  // 这里的 effect.pasue() 不会影响计算属性内部的更新, 因为计算属性已经不在基于 effect 实现了
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
      // 当在用户函数 this.fn() 中设置值时, 执行到此处 此时的 EffectFlags.RUNNING 为 true
      // 在不启用 ALLOW_RECURSE 这里直接返回了 导致不会执行 batch(this), 从而导致 batchedSub 为 undfined
      // 因为在执行 this.fn() 前, batchedSub 为 undfined, 或者在 endBatch 中在执行 this.fn 前,
      // 将 batchedSub 值设置为 undefined 了, 而在 this.fn() 中设置值, 执行到这里判断
      // EffectFlags.RUNNING 为 true, 从而不去设置 batchedSub 导致 endBatch 中不会再次执行 this.fn,
      // 这样则避免了无限递归循环问题
      //
      return
    }
    // !! 注意: 每个 dep.trigger 总是 startBatch(), batch(this), endBatch() 是成对的, 最终 batchDepth
    // 总是前后不变, 只有外部的 比如这里最上面的 startBatch() 执行时才会导致 batchDepth 一直 > 0 , 直
    // 到最后成对的 endBatch() 才会将 batchDepth 设置到 0
    /**
     *
     *```js
     *  dep.trigger() {
     *    dep.version++ // => link.dep.version++
     *    dep.notfiy() {
     *      startBatch(){ batchDepth++ },
     *      // 一个 dep 会对应多个 sub, 这里遍历逐个 notify
     *      for (let link = this.subs; link; link = link.prevSub) {
     *        link.sub.notify() {
     *          if(sub.flags & EffectFlags.RUNNING) {
     *            // 不允许递归调用则直接返回, 默认为不允许递归
     *            if(!(sub.flags & EffectFlags.ALLOW_RECURSE)) return
     *          }
     *          if(sub.flags & EffectFlags.NOTIFIED) return
     *          batch(sub) {
     *            sub.flags |= EffectFlags.NOTIFIED
     *            sub.next = batchedSub
     *            batchedSub = sub
     *          }
     *        },
     *      }
     *      endBatch() {
     *        batchDepth--
     *        if(batchDepth > 0) return
     *        e = batchedSub
     *        batchedSub = undefined
     *        next = e.next
     *        e.flags &= ~EffectFlags.NOTIFIED
     *        if (!(e.flags & EffectFlags.ACTIVE)) return
     *        e.trigger(){
     *          if (!isDirty(e){
     *            // 遍历当前 sub 中的 link (dep)
     *            for (let link = sub.deps; link; link = link.nextDep) {
     *              if(link.version !== link.dep.version) return true
     *              // 若遍历的 dep 为 computed
     *              if(link.dep.computed) {
     *                // 调用 refreshComputed() 对计算属性进行求值, 更新计算属性的 dep.version
     *                refreshComputed(link.dep.computed)
     *                // 更新 计算属性的 dep.version 后
     *                if(link.version !== link.dep.version) return true
     *              }
     *            }
     *            return false
     *          }) return
     *          e.run() {
     *            if (this.flags & EffectFlags.ACTIVE) return
     *            e.flags |= EffectFlags.RUNNING
     *            // NOTE: fn() 执行前,
     *            // 1. NOTIFIED 已经被去掉
     *            // 2. batchedSub 已经被置为 undefined
     *            e.fn() {
     *              // ... 重新进行依赖收集
     *              dep.track() {
     *                // 新的 dep: new Link(dep, sub) and addSub(link)
     *                // 老的 dep: 同步版本
     *                link.version = this.version
     *                // 更新 link 读取顺序
     *                // ...
     *              }
     *              // dep.trigger -> EffectFlags.RUNNING -> return 避免递归循环
     *            }
     *            // 依赖收集结束后, 清除依赖(之前存在的, 这次运行后不存在的, 需要移除)
     *            cleanupDeps(this)
     *            e.flags &= ~EffectFlags.RUNNING
     *          }
     *        }
     *        e.next = next // 继续下一个 sub 的更新
     *      }
     *    }
     *  }
     * ```
     */
    if (!(this.flags & EffectFlags.NOTIFIED)) {
      batch(this)
    } else {
      console.log('NOTIFIED')
    }
  }

  run(): T {
    // TODO cleanupEffect

    if (!(this.flags & EffectFlags.ACTIVE)) {
      // stopped during cleanup
      // 为何 这里还敢执行 this.fn(), 不拍触发 get track 吗?
      // 首先看 this.stop() 做了什么? 不会触发 trigger
      // 因为在 stop() 中移除了每个 link 对应的 link.dep.subs
      // console.log(`effect.stop`)
      // NOTE:
      // 注意这里直接返回了, 此时的 activeSub = undefined
      // activeSub 要到下面的 语句才赋值为 this, 所以这里即使触发的 fn 中 get
      // 也会在 deo.track 中立即返回 而不会进行实际的 track

      // stopped during cleanup
      return this.fn()
    }

    this.flags |= EffectFlags.RUNNING
    cleanupEffect(this)
    prepareDeps(this)
    const prevEffect = activeSub
    const prevShouldTrack = shouldTrack
    activeSub = this

    // effect(() => {
    //   spy1()
    //   pauseTracking() -- 设置了 shouldTrack = false 外部设置的 shouldTrack 不影响嵌套内部的 effect 执行
    //   时还会设置 shouldTrack 为 true, 因为每一个 effect 内部会会将 shouldTrack 重置为 true
    //   n.value
    //   effect(() => { -- 但是进入了这个嵌套的 effect 时, 将之前的 shouldTrack 保存,
    //   此时再强制将 shouldTrack 设置为 true, 结束后,再恢复之前保存的 shouldTrack
    //     n.value
    //     spy2()
    //   })
    //   n.value
    //   resetTracking()
    // })
    // 这里的 shouldTrack 设置为 true, 是为了不受外部的 pauseTracking() 设置的影响, 无论外部如何设置
    // shouldTrack, 这里一定设置为 true, 因为我下面就是要执行依赖收集的
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

  // 这里的 effect.pasue() 不会影响计算属性内部的更新, 因为计算属性已经不在基于 effect 实现了
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
    // trigger 会首先检查此 effect 是否有被 paused
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
//     startBatch() // ++
//     batch(sub)
//     endBatch()
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

  // 最后计算更新时,先更新 sub 中 compute, 先对 sub 中的 computed 进行求一次值
  // 注意这里面并有进行求值, 因为求值的过程已经在 compute 收集依赖时(refreshComputed) 的同时进行
  // 值的计算了, 并且保存在 computed._value 中了, 所以这里无需再次进行求值
  // 这里只是将 computed 的 flags NOTIFIED 去掉
  if (batchedComputed) {
    let e: Subscriber | undefined = batchedComputed
    batchedComputed = undefined
    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED
      e = next
      // NOTE:
      // 计算属性没有 e.trigger(), 这里只是仅仅去掉标识 NOTIFIED
      // 这里是由于计算属性中依赖触发的更新执行到这里,只是将这里的 computed 中的标识 NOTIFIED 去掉而已
      // NOTIFIED 是在 batch() 函数中设置: sub.flags |= EffectFlags.NOTIFIED
      // 计算属性不在这里执行其更新函数, 而是推迟(Lazy)到实际读取值 com.value 时执行其更新函数(effectGetter)
      // 这里的计算属性 effect, 并没有 ACTIVE 状态, 说明计算属性没有 stop, pause, resume 等 effect 功能
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
          ;(e as ReactiveEffect).trigger() // {
          //   batchedSub = newSub
          // }
          // 若是这里的 e.trigger() -> this.fn() 中可能递归执行的
          // 这里面是可以再次设置 batchedSub 为新的 sub 的
          // 所以此时在里面这一层 while 循环结束后, 会再次执行外层的 while(batchedSub) {
          //   继续消费 batchedSub 上面的 sub
          // }
          // 这就是这里之所以使用两层 while () 的使用场景
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
    // store previous active sub if link was being used in another context
    link.prevActiveLink = link.dep.activeLink
    link.dep.activeLink = link
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
  // for (let link = sub.deps; link; link = link.nextDep) {
  //   if (
  //     link.dep.version !== link.version ||
  //     (link.dep.computed &&
  //       (refreshComputed(link.dep.computed) ||
  //         link.dep.version !== link.version))
  //   ) {
  //     return true
  //   }
  // }
  // 遍历当前 sub 中的 link (dep)
  for (let link = sub.deps; link; link = link.nextDep) {
    if (link.version !== link.dep.version) return true
    // 若遍历的 dep 为 computed
    if (link.dep.computed) {
      // 调用 refreshComputed() 对计算属性进行求值, 更新计算属性的 dep.version
      refreshComputed(link.dep.computed)
      // 更新 计算属性的 dep.version 后
      if (link.version !== link.dep.version) return true
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
 * 返回 false 表示计算属性重新计算值(重新设置值)失败,返回false
 * 依旧使用之前的 this._value
 * @internal
 */
export function refreshComputed(computed: ComputedRefImpl): undefined {
  // EffectFlags.TRACKING compute 的 TRACKING 在 addSub(link) 中设置,也就是初始化加入首个 sub 时设置
  // 在 removeSub(link) 中去除 EffectFlags.TRACKING
  if (
    computed.flags & EffectFlags.TRACKING &&
    // computed.flags 默认包含 DIRTY
    !(computed.flags & EffectFlags.DIRTY)
  ) {
    // computed.notify() 中设置 computed.flags |= EffectFlags.DIRTY
    // 在 TRACKING (没有被移除) && 第二次(同步)执行时直接使用前一次执行时的 _value
    // 提前返回,表示无需计算值,直接使用之前的 this._value
    return
  }
  // 每次读取值时, 先移除 DIRTY 标识
  computed.flags &= ~EffectFlags.DIRTY

  // globalVersion++ 在 dep.trigger() 执行, 只要有设置值, globalVersion++
  // 注意理解这个 globalVersion 只要 globalVersion 没有变化, 那么说明整个 sub(effect), 或者整个 app
  // 都没有触发 set 操作, 此时可以看做没有变化, 那么这里的 compute 则无需再次计算, 因为整个的都没有变化,
  // 若是 computed 中的 dep 有 trigger 那么 globalVersion 必然不相等
  // 创建一个 Computed 时, 其初始的 this.globalVersion = globalVersion - 1 ? 这里为什么 -1
  // 之所以创建 computed.globalVersion = globalVersion - 1, 就是为在初次读取值, 造成不相等,
  // 执行下面的求值函数
  // computed.globalVersion = globalVersion - 1 初始化时 computed.globalVersion 与 globalVersion 不相等
  // 难道只是为了初始化时不相等?

  // Global version fast path when no reactive changes has happened since
  // last refresh.
  if (computed.globalVersion === globalVersion) {
    // 提前返回,表示无需计算值,直接使用之前的 this._value
    // 若是在 SSR 中 computed 总是 re-evaluate, 在 SSR 值的缓存策略只能依靠 globalVersion 进行判断是否需要重新计算
    // 所以注意 globalVersion 主要用在 SSR 中, 而不是 client 中的渲染中
    return
  }
  // 记住此次 computed 的版本, 下次更新时, 若还是这个版, 说明没有触发任何的 set 操作
  // 这里只能用于服务器(SSR) 中保存全局更新版本, 所以这里的 globalVersion 只能用于 SSR 中 fast path (优化)
  computed.globalVersion = globalVersion

  const dep = computed.dep
  computed.flags |= EffectFlags.RUNNING
  // In SSR there will be no render effect, so the computed has no subscriber
  // and therefore tracks no deps, thus we cannot rely on the dirty check.
  // Instead, computed always re-evaluate and relies on the globalVersion
  // fast path above for caching.
  if (
    // dep.version > 0 表示不是初始化, 初始化的 dep.version = 0
    dep.version > 0 &&
    !computed.isSSR &&
    // computed.deps 在 computed 执行 getter 收集依赖时的 dep.track 设置 computed.deps
    // 这里要将 computed 看成是另一种 effect, computed 中也会包含很多的 dep
    computed.deps &&
    // 注意这里的 isDirty(computed) 是判断 computed 内部的依赖是否 dirty
    // computed(() => { foo.a, foo.b, foo.c })
    // 遍历整个 computed 中的 dep, 若是这这里面的 dep 都没有变化, 也就无需再次计算
    // 注意:
    // computed 本身就是一个 sub, 它里面也是由很多的 dep 组成的
    // computed 又是一个 dep, 作为 某个 sub 的 dep, 可以看成是 computed 是一个大型的 dep, 由很多的子 dep 构成
    // computed 里面的 dep 更新 dep.trigger -> dep.subs.compute(作为 sub).notify() -> compute(作为 dep).notfiy()
    // 注意这里要考虑初始化会执行
    !isDirty(computed) // 这里传入的 computedEffect
  ) {
    // 每次 computed 读取值 会进行脏检查, 若是没有脏, 则无需更新 computed._value
    computed.flags &= ~EffectFlags.RUNNING
    return
  }

  // effect(() => {
  //   effect 执行时, 读取计算属性的值, 执行函数 refreshComputed, 将 activeSub = computed
  //   computed.value {
  //     computed.dep.track(effect) // 先执行当前的 计算属性 dep.track 到 effect
  //     然后执行:
  //     refreshComputed{
  //       activeSub = computed
  //       函数里面进行是否更新 computed._value
  //     }
  //     执行完 refreshComputed
  //     return computed._value
  //   }
  //   计算属性值读取完后,回复当前 effect 执行中的上下文的 activeSub = prevSub
  // })

  // 这里切换 activeSub, 准备收集 computedEffect 中的 dep
  const prevSub = activeSub
  const prevShouldTrack = shouldTrack
  activeSub = computed
  // 这里设置 activeSub = computed
  // 注意这里的 activeSub === this.computed 场景为: 计算属性中又嵌套计算属性
  // const com = computed(() => {
  //   这里的计算属性 com 依赖了 com 自身, 导致递归依赖时, 此时执行 com.value 进行的依赖收集时,
  //   不需要将自身作为依赖收集
  //   return com.value + foo.a
  // })
  // track(debugInfo?: DebuggerEventExtraInfo): Link | undefined {
  //   if (!activeSub || !shouldTrack || activeSub === this.computed) {
  //     return
  //   }
  shouldTrack = true

  try {
    // 处理 computed 中的 link, dep
    prepareDeps(computed)
    // 执行 computed getter
    // computed((oldValue) => {
    //   return foo.a + foo.b + foo.c
    // })
    // 求值的同时进行计算属性的依赖搜集, 不过是依赖搜集对应的 activeSub 为这里的 computed
    // effect(() => {
    //   在 effect 中, 此时的 activeSub 为 effect
    //   读取计算属性,执行计算属性的 getter, 临时切换 activeSub 到 computed, 收集 computed 内部的依赖,
    //   同时进行求值,也就是在求值的同时进行computed的依赖搜集
    //   com.value(() => { ref.value })
    //   计算属性读取完毕后, 恢复之前的 active 为 effect,
    //   foo.a, 继续 effect 的普通的 dep 收集
    // })
    // 既收集了 computedEffect 的 dep后, 将函数值进行返回作为 computed 的返回值
    const value = computed.fn(computed._value)
    if (dep.version === 0 || hasChanged(value, computed._value)) {
      // dep.version = 0 表示初始值, 还未被设置过值
      // 或者有设置过值,但是之前的值与这次重新计算的值不同
      // 需要更新值
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
  /*
   const runner = effect(fn)
   // 注意这类传入的 runner 是从一个 effect 返回的 runner, 此时这里就将 runner 进行解包,
   // 将 runner 中的 fn 提取出来, 传入 effect
   const runner2 = effect(runner)
   // ==> 等价于
   const runner3 = effect(fn)
  */
  // 这里要考虑 fn = effect(fn), fn 是从另一个 effect 返回的 runner
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
