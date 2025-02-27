import type { ReactiveEffect } from './effect'
import { warn } from './warning'

export let activeEffectScope: EffectScope | undefined

export class EffectScope {
  /**
   * @internal
   */
  private _active = true
  /**
   * @internal track `on` calls, allow `on` call multiple times
   */
  private _on = 0
  /**
   * @internal
   */
  effects: ReactiveEffect[] = []
  /**
   * @internal
   */
  cleanups: (() => void)[] = []

  private _isPaused = false

  /**
   * only assigned by undetached scope
   * @internal
   */
  parent: EffectScope | undefined
  /**
   * record undetached scopes
   * @internal
   */
  scopes: EffectScope[] | undefined
  /**
   * track a child scope's index in its parent's scopes array for optimized
   * removal
   * @internal
   */
  private index: number | undefined

  constructor(public detached = false) {
    this.parent = activeEffectScope
    if (!detached && activeEffectScope) {
      this.index =
        // push 函数返回的是新的数组的长度, 这里 - 1 才是插入数组最后一个元素的索引
        (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this,
        ) - 1
    }
  }

  get active(): boolean {
    return this._active
  }

  pause(): void {
    if (this._active) {
      this._isPaused = true
      let i, l
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].pause()
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause()
      }
    }
  }

  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume(): void {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false
        let i, l
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i].resume()
          }
        }
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i].resume()
        }
      }
    }
  }

  // 主要用来收集 effect
  /**
   * // effect, computed, watch, watchEffect created inside the scope will be collected
   * const scope = effectScope()
   * scope.run(() => {
   *   const doubled = computed(() => counter.value * 2)
   *   watch(doubled, () => console.log(doubled.value))
   *   watchEffect(() => console.log('Count: ', doubled.value))
   *   const scope2 = effectScope()
   *   scope2.index = 0
   *   此时的 activeEffectScope 为 scope
   *   scope.scopes.push(scope2)
   *   scope2.run(() => {
   *     effect(() => { ... })
   *   })
   * })
   * // to dispose(清除) all effects in the scope
   * scope.stop()
   */
  // scope.run(() => { effect() })
  // effect 只有在 scope.run() 中运行才会有 activeEffectScope
  // 若是没有调用 scope.run, 只是单独调用了 effect(), 由于在 effect 中 construct 中
  // 会判断 activeEffectScope, 由于 effect 没有在 scope.run 中调用
  // 所以 activeEffectScope 为 undefined 此时 单独调用的 effect 不会将其放入 activeEffectScope 中
  // 即 scope.effects 中

  // effect 必须放在 scope.run 函数中
  // scope.run(() => {
  //   // 这里类似于 Vue 中的 钩子函数必须在 setup 中执行一样
  //   // effect 也必须在 run 上下文中执行, 才有 activeEffectScope
  //   effect()
  //   effect()
  //   // onScopeDispose 必须在 run 上下文中执行, 才会有 activeEffectScope
  //   onScopeDispose(fn)
  // })
  run<T>(fn: () => T): T | undefined {
    if (this._active) {
      const currentEffectScope = activeEffectScope
      try {
        // new EffectScope 时没有设置 activeEffectScope, 只有调用 run 时才会设置 activeEffectScope
        // effectScope
        // 只有执行 scope.run() 才会设置 activeEffectScope 到当前的 scope
        // 没有执行 run 则不会设置 activeEffectScope
        // effect 应在 run(fn) 中 fn 中执行, 才会进行收集
        activeEffectScope = this
        return fn()
      } finally {
        // run 函数执行完后 恢复 activeEffectScope
        activeEffectScope = currentEffectScope
      }
    } else if (__DEV__) {
      warn(`cannot run an inactive effect scope.`)
    }
  }

  prevScope: EffectScope | undefined
  /**
   * This should only be called on non-detached scopes
   * 非孤立的 scope, 既可以被 track 的 scope
   * @internal
   */
  on(): void {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope
      activeEffectScope = this
    }
  }

  /**
   * This should only be called on non-detached scopes
   * 非孤立的 scope, 既可以被 track 的 scope
   * @internal
   */
  off(): void {
    if (this._on > 0 && --this._on === 0) {
      activeEffectScope = this.prevScope
      this.prevScope = undefined
    }
  }

  stop(fromParent?: boolean): void {
    if (this._active) {
      this._active = false
      let i, l
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop()
      }
      this.effects.length = 0

      // onScopeDispose 必须在 scope.run(() => {
      //   effect()
      //   // onScopeDispose 必须在 run 上下文中执行, 才会有 activeEffectScope
      //   onScopeDispose(fn)
      // })
      // 执行回调 通过 onScopeDispose(fn) 注册到 cleanups 中的函数
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]()
      }
      this.cleanups.length = 0

      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true)
        }
        this.scopes.length = 0
      }

      // nested scope, dereference from parent to avoid memory leaks
      if (!this.detached && this.parent && !fromParent) {
        // 这里 !fromParent 说明是当前主动调用的 scope.stop() 函数, 而不是由内部触发的 stop(true)
        // 上面将我的 children 的各种 scope 停掉后, 现在执行到这里, 说明是要将自己从 parent 中移除
        // 上面是移除我的 children,
        // 现在是移除我自己从 parent 中 (若是有 parent)
        // NOTE: 这里从数组中移除元素真的好优雅
        // optimized O(1) removal
        const last = this.parent.scopes!.pop()
        // [a, b, c, d] 从数组移除引用 a, b, c, d 都是 scope (对象)
        // 当某个 scope 需要 stop, 则表示该 scope 对应的 ref 应该移除, 以便于 js 的垃圾回收器回收
        // 1. 如果 d.stop(), 则是要移除 d, 则直接 [a, b, c, d].pop() -> [a, b, c] 这样 d 就不再被数组引用了, 那么
        //    对象没有ref(引用), 就会被垃圾回收
        // 2. 如果 b.stop(), 则是要移除 b, 那么 b.parent.scopes.pop() -> [a, b, c] 后, 发现 b 并没有被移除引用,
        //    而是将不该移除的 d 给移除了, 而 b 还保存在数组引用中, 此时可以读取 b.index 获取其在数
        //    组的索引 [a, b, c][b.index] = d --> [a, d, c] 将 b 重写为 d, 这样 b 被移除,
        //    然后再将 d.index 更新为 b.index 至此, b 就算是被从数组中移除了,
        //    b 没有额外的引用了(不可访问了), 后面会被垃圾回收器给回收. 最后再将 d.index = b.index 确保 d 在
        //    数组的索引是正确的
        // 这里不关注顺序, 若是关注顺序, 可以使用各自的索引排下序即可
        if (last && last !== this) {
          this.parent.scopes![this.index!] = last
          last.index = this.index!
        }
        // 若 last === this, 则说明 this 是最后一个 scope, 则直接 pop 即可, 无需更新索引
      }
      this.parent = undefined
    }
  }
}

/**
 * Creates an effect scope object which can capture the reactive effects (i.e.
 * computed and watchers) created within it so that these effects can be
 * disposed together. For detailed use cases of this API, please consult its
 * corresponding {@link https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md | RFC}.
 *
 * @param detached - Can be used to create a "detached" effect scope.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export function effectScope(detached?: boolean): EffectScope {
  return new EffectScope(detached)
}

/**
 * Returns the current active effect scope if there is one.
 *
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export function getCurrentScope(): EffectScope | undefined {
  return activeEffectScope
}

/**
 * Registers a dispose callback on the current active effect scope. The
 * callback will be invoked when the associated effect scope is stopped.
 *
 * @param fn - The callback function to attach to the scope's cleanup.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
// onScopeDispose 必须在 scope.run(() => {
//   effect()
//   // onScopeDispose 必须在 run 上下文中执行, 才会有 activeEffectScope
//   onScopeDispose(fn)
// })
export function onScopeDispose(fn: () => void, failSilently = false): void {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn)
  } else if (__DEV__ && !failSilently) {
    warn(
      `onScopeDispose() is called when there is no active effect scope` +
        ` to be associated with.`,
    )
  }
}
