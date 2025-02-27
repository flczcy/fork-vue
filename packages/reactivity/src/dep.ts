import { extend, isArray, isIntegerKey, isMap, isSymbol } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import { type TrackOpTypes, TriggerOpTypes } from './constants'
import {
  type DebuggerEventExtraInfo,
  EffectFlags,
  type Subscriber,
  activeSub,
  endBatch,
  shouldTrack,
  startBatch,
} from './effect'

/**
 * Incremented every time a reactive change happens
 * This is used to give computed a fast path to avoid re-compute when nothing
 * has changed.
 */
export let globalVersion = 0

/**
 * Represents a link between a source (Dep) and a subscriber (Effect or Computed).
 * Deps and subs have a many-to-many relationship - each link between a
 * dep and a sub is represented by a Link instance.
 *
 * A Link is also a node in two doubly-linked lists - one for the associated
 * sub to track all its deps, and one for the associated dep to track all its
 * subs.
 *
 * @internal
 */
export class Link {
  /**
   * - Before each effect run, all previous dep links' version are reset to -1
   * - During the run, a link's version is synced with the source dep on access
   * - After the run, links with version -1 (that were never used) are cleaned
   *   up
   */
  version: number

  /**
   * Pointers for doubly-linked lists
   */
  nextDep?: Link
  prevDep?: Link
  nextSub?: Link
  prevSub?: Link
  prevActiveLink?: Link

  constructor(
    // 这里参数的 public 默认会设置 this.sub = sub, 特别注意这一点,否则会不直观
    public sub: Subscriber,
    public dep: Dep,
  ) {
    // this.sub = sub
    // this.dep = dep
    this.version = dep.version
    this.nextDep =
      this.prevDep =
      this.nextSub =
      this.prevSub =
      this.prevActiveLink =
        undefined
  }
}

/**
 * @internal
 */
export class Dep {
  version = 0
  /**
   * Link between this dep and the current active effect
   */
  activeLink?: Link = undefined

  /**
   * Doubly linked list representing the subscribing effects (tail)
   * 一个 Dep 对应多个 sub, 这里的的 subs 是不断变化的
   * [[dep], [dep], [dep]]
   *                 |<- sub
   *  |<-subHead
   * 指向最后一个引用该 dep 的 sub
   */
  subs?: Link = undefined

  /**
   * Doubly linked list representing the subscribing effects (head)
   * DEV only, for invoking onTrigger hooks in correct order
   */
  subsHead?: Link

  /**
   * For object property deps cleanup
   */
  map?: KeyToDepMap = undefined
  key?: unknown = undefined

  /**
   * Subscriber counter
   */
  sc: number = 0

  // 这里的 dep 居然这里和 computed 耦合在一起了
  // 注意这里要是传入 new Dep(computed) 说明这个 dep 是属于 computed dep
  // effect(() => { com.value, foo.bar } ) -> 在 effect 中的依赖中 这个依赖属于 computed 的 dep
  // 也就是在effect 的 deps 中, dep 分类两类,
  // 一类为普通的 dep, 比如这里的 foo.bar,
  // 一类为这里的 com.value 属于 computed 的 dep
  // dep 分类(普通 dep, 包装 dep 即计算属性dep)
  constructor(public computed?: ComputedRefImpl | undefined) {
    if (__DEV__) {
      this.subsHead = undefined
    }
  }

  // NOTE: 运行 track 执行会执行这个函数, this 指向 effect
  // prepareDeps(this)
  track(debugInfo?: DebuggerEventExtraInfo): Link | undefined {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return
    }

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

    let link = this.activeLink
    // 若是是新出现的 dep 直接往链表尾部追加
    if (link === undefined || link.sub !== activeSub) {
      // link === undefined
      //   -> 表示 dep 第一次被 track
      // link != undefined && link.sub !== activeSub
      //   -> 表示 dep 第二次被 track, 但是与第一次不同是在另一个 sub
      // 以上两种情况, 需要更新 this.activeLink 为新的 link,
      // 注意 dep 只会在第一次 get 时创建一次,后面 get 不再创建 dep
      link = this.activeLink = new Link(activeSub, this)

      // add the link to the activeEffect as a dep (as tail)
      if (!activeSub.deps) {
        // [link] 若是activeSub.deps不存在说明是初始执行,此时设置 deps, depsTail 都指向同一个 link
        activeSub.deps = activeSub.depsTail = link
      } else {
        // 后面 activeSub.deps 设置了值,之后的其他 dep
        // [link1, link2, link]
        // link.prevDep -> link2(也就是尾部, link2 正好是链表尾部)
        link.prevDep = activeSub.depsTail
        // link2.nextDep -> 指向当前的 link
        // [link1, link2, link]
        activeSub.depsTail!.nextDep = link
        // 更新新的链表尾部
        // [link1, link2, link]
        //                 |
        activeSub.depsTail = link
      }
      // 以上是构建 sub 中的各个 dep 之间的 link 链表 (sub.deps 表示链表 head, sub.depsTail 表示链表 tail)
      // activeSub 则是 link.sub, 因为创建 link 把 activeSub 传入了
      // link.sub.deps 执行 第一个 link1, link.sub.depsTail 指向最后一个 link, 这里则是当前的 link
      // 这里把 link.sub 中的 deps 构建了链表
      //
      // link.sub.deps -> head
      // link.dep.subs -> tail

      // 这里需要把 link.deps 中 subs 进行构建链表, 以便后面 dep.set 通过 dep.subs 进行链表查询其对应的 sub 更新
      // link.dep.subs, link.dep.subHead
      addSub(link)
    } else if (link.version === -1) {
      // reused from last run - already a sub, just sync version
      // dep.trigger() 中 this.version++
      link.version = this.version

      // If this dep has a next, it means it's not at the tail - move it to the
      // tail. This ensures the effect's dep list is in the order they are
      // accessed during evaluation.
      // [link] 有 nextDep 说明不是最尾部的 link, 则需要执行重新插入排序, 因为前面的 link 可能 在 v-if 中移除
      // 这里按照读取顺序进行链表插入 [1, 2, 3, 4, 5]
      // 执行 1, 插入到 末尾 [2,3,4,5,1]
      // 执行 2, 插入到 末尾 [3,4,5,1,2]
      // 执行 3, 插入到 末尾 [4,5,1,2,3]
      // 执行 4, 插入到 末尾 [5,1,2,3,4]
      // 执行 5, 插入到 末尾 [1,2,3,4,5]
      // [link,link]
      // 这里读取中,执行新的链表构建,这将确保get的读取顺序
      // 注意这里并没有清除不在显示的 dep, 清除不在显示的 dep 在 this.fn() 执行完后在 cleanupDeps 中清除
      if (link.nextDep) {
        // link: 1, next: 2
        // [1,2,3,4,5]
        const next = link.nextDep // 2
        next.prevDep = link.prevDep // undefined
        if (link.prevDep) {
          link.prevDep.nextDep = next
        }

        // 把当前的 link 设置到 链表的尾部
        // 当前 link 的前一个 dep 指向上一个链表的尾部
        link.prevDep = activeSub.depsTail
        link.nextDep = undefined
        // 5.nextDep = link
        activeSub.depsTail!.nextDep = link
        // 设置当前链表的尾部指向当前的 link
        // 这里是一个动态调整的过程
        activeSub.depsTail = link

        // this was the head - point to the new head
        if (activeSub.deps === link) {
          activeSub.deps = next
        }
      }
    }

    if (__DEV__ && activeSub.onTrack) {
      activeSub.onTrack(
        extend(
          {
            effect: activeSub,
          },
          debugInfo,
        ),
      )
    }

    return link
  }

  trigger(debugInfo?: DebuggerEventExtraInfo): void {
    this.version++
    globalVersion++
    this.notify(debugInfo)
  }

  // 这里的每一次 set 操作都会执行一次 notify()
  // foo.value++
  // foo.value++
  // foo.value++
  // 这里设置值多次, 会触发发这里的 notify() 多次, sub1.trigger(), sub2.trigger(), sub3.trigger()
  // 能够通过 把这里的更新操作放在 startBatch, endBatch 之间, 则只会触发一次
  // startBatch()
  //   foo.value++
  //   foo.value++
  //   foo.value++
  // endBatch()
  // 以上包裹在 startBatch, endBatch 之间, 则只会触发一次
  notify(debugInfo?: DebuggerEventExtraInfo): void {
    startBatch()
    try {
      if (__DEV__) {
        // subs are notified and batched in reverse-order and then invoked in
        // original order at the end of the batch, but onTrigger hooks should
        // be invoked in original order here.
        for (let head = this.subsHead; head; head = head.nextSub) {
          if (head.sub.onTrigger && !(head.sub.flags & EffectFlags.NOTIFIED)) {
            head.sub.onTrigger(
              extend(
                {
                  effect: head.sub,
                },
                debugInfo,
              ),
            )
          }
        }
      }
      for (let link = this.subs; link; link = link.prevSub) {
        // [sub1, sub2, sub3]
        //               | <- 这里是从后往前遍历 dep 最后执行的那个 sub 优先往前通知
        // batch(sub)
        //   sub.next = batchedSub
        //   batchedSub = sub
        // 这里通知是从子往父级冒泡通知, 构建链表
        // 最后执行到 sub1 时, batchedSub = sub1, 此时 sub1.next -> sub2.next-> sub3.next -> undefined
        // 通过这里的 notify() 有构建了一个执行 链表 batchedSub = sub1 -> sub2 -> sub3
        //
        if (link.sub.notify()) {
          // if notify() returns `true`, this is a computed. Also call notify
          // on its dep - it's called here instead of inside computed's notify
          // in order to reduce call stack depth.
          // effect(() => {
          //   com.value {              | computed.dep.notify() 通知最外层的 effect 进行更新
          //     return computed(() => {
          //                            | 通知内部的 computed.notify()
          //       return ref.value -> 更新了 -> computed.notify() -> computed.dep.notify()
          //     })
          //   }
          // })
          // 这里的 computed.dep.notify() 是通知外部的 effect() 进行更新
          ;(link.sub as ComputedRefImpl).dep.notify()
        }
      }
    } finally {
      // 最终在 endBatch() 按照 batchedSub = sub1 -> sub2 -> sub3 这个顺序
      // 逐个执行 sub1.trigger(), sub2.trigger(), sub3.trigger()
      endBatch()
    }
  }
}

function addSub(link: Link) {
  link.dep.sc++
  if (link.sub.flags & EffectFlags.TRACKING) {
    const computed = link.dep.computed
    // computed getting its first subscriber
    // enable tracking + lazily subscribe to all its deps
    if (computed && !link.dep.subs) {
      computed.flags |= EffectFlags.TRACKING | EffectFlags.DIRTY
      for (let l = computed.deps; l; l = l.nextDep) {
        addSub(l)
      }
    }
    // subs: [link]
    // subs: [link1, link2, link]
    const currentTail = link.dep.subs // undefined or link2
    if (currentTail !== link) {
      // link2 !== link
      // [link1, link2, link]
      //           |<-  .prevSub
      link.prevSub = currentTail
      // [link1, link2,      link]
      //         .nextSub -> |
      if (currentTail) currentTail.nextSub = link
    }

    if (__DEV__ && link.dep.subsHead === undefined) {
      // subHead 只会被赋值一次, 因为一个 dep 对应的第一个 sub 是不会变化的, 但是这个 dep 还会有第 2, 3, ...个 sub
      // 所以 dep 所对应的 subs(tail) 尾部是不断变化的
      link.dep.subsHead = link
    }

    // 该 link 的 dep 对应的 sub 指向最后一个 sub
    link.dep.subs = link
  }
}

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Maps to reduce memory overhead.
type KeyToDepMap = Map<any, Dep>

export const targetMap: WeakMap<object, KeyToDepMap> = new WeakMap()

export const ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Object iterate' : '',
)
export const MAP_KEY_ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Map keys iterate' : '',
)
export const ARRAY_ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Array iterate' : '',
)

/**
 * Tracks access to a reactive property.
 *
 * This will check which effect is running at the moment and record it as dep
 * which records all effects that depend on the reactive property.
 *
 * @param target - Object holding the reactive property.
 * @param type - Defines the type of access to the reactive property.
 * @param key - Identifier of the reactive property to track.
 */
export function track(target: object, type: TrackOpTypes, key: unknown): void {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = new Dep()))
      dep.map = depsMap
      dep.key = key
    }
    if (__DEV__) {
      dep.track({
        target,
        type,
        key,
      })
    } else {
      dep.track()
    }
  }
}

/**
 * Finds all deps associated with the target (or a specific property) and
 * triggers the effects stored within.
 *
 * @param target - The reactive object.
 * @param type - Defines the type of the operation that needs to trigger effects.
 * @param key - Can be used to target a specific reactive property in the target object.
 */
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>,
): void {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    globalVersion++
    return
  }

  const run = (dep: Dep | undefined) => {
    if (dep) {
      if (__DEV__) {
        dep.trigger({
          target,
          type,
          key,
          newValue,
          oldValue,
          oldTarget,
        })
      } else {
        dep.trigger()
      }
    }
  }

  startBatch()

  if (type === TriggerOpTypes.CLEAR) {
    // collection being cleared
    // trigger all effects for target
    depsMap.forEach(run)
  } else {
    const targetIsArray = isArray(target)
    const isArrayIndex = targetIsArray && isIntegerKey(key)

    if (targetIsArray && key === 'length') {
      const newLength = Number(newValue)
      depsMap.forEach((dep, key) => {
        if (
          key === 'length' ||
          key === ARRAY_ITERATE_KEY ||
          (!isSymbol(key) && key >= newLength)
        ) {
          run(dep)
        }
      })
    } else {
      // schedule runs for SET | ADD | DELETE
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key))
      }

      // schedule ARRAY_ITERATE for any numeric key change (length is handled above)
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY))
      }

      // also run for iteration key on ADD | DELETE | Map.SET
      switch (type) {
        case TriggerOpTypes.ADD:
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY))
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY))
            }
          } else if (isArrayIndex) {
            // new index added to array -> length changes
            run(depsMap.get('length'))
          }
          break
        case TriggerOpTypes.DELETE:
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY))
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY))
            }
          }
          break
        case TriggerOpTypes.SET:
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY))
          }
          break
      }
    }
  }

  endBatch()
}

export function getDepFromReactive(
  object: any,
  key: string | number | symbol,
): Dep | undefined {
  const depMap = targetMap.get(object)
  return depMap && depMap.get(key)
}
