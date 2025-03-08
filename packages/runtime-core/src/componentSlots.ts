import { type ComponentInternalInstance, currentInstance } from './component'
import {
  type VNode,
  type VNodeChild,
  type VNodeNormalizedChildren,
  normalizeVNode,
} from './vnode'
import {
  EMPTY_OBJ,
  type IfAny,
  type Prettify,
  ShapeFlags,
  SlotFlags,
  def,
  isArray,
  isFunction,
} from '@vue/shared'
import { warn } from './warning'
import { isKeepAlive } from './components/KeepAlive'
import { type ContextualRenderFn, withCtx } from './componentRenderContext'
import { isHmrUpdating } from './hmr'
import { DeprecationTypes, isCompatEnabled } from './compat/compatConfig'
import { TriggerOpTypes, trigger } from '@vue/reactivity'
import { createInternalObject } from './internalObject'

export type Slot<T extends any = any> = (
  ...args: IfAny<T, any[], [T] | (T extends undefined ? [] : never)>
) => VNode[]

export type InternalSlots = {
  [name: string]: Slot | undefined
}

export type Slots = Readonly<InternalSlots>

declare const SlotSymbol: unique symbol
export type SlotsType<T extends Record<string, any> = Record<string, any>> = {
  [SlotSymbol]?: T
}

export type StrictUnwrapSlotsType<
  S extends SlotsType,
  T = NonNullable<S[typeof SlotSymbol]>,
> = [keyof S] extends [never] ? Slots : Readonly<T> & T

export type UnwrapSlotsType<
  S extends SlotsType,
  T = NonNullable<S[typeof SlotSymbol]>,
> = [keyof S] extends [never]
  ? Slots
  : Readonly<
      Prettify<{
        [K in keyof T]: NonNullable<T[K]> extends (...args: any[]) => any
          ? T[K]
          : Slot<T[K]>
      }>
    >

export type RawSlots = {
  [name: string]: unknown
  // manual render fn hint to skip forced children updates
  $stable?: boolean
  /**
   * for tracking slot owner instance. This is attached during
   * normalizeChildren when the component vnode is created.
   * @internal
   */
  _ctx?: ComponentInternalInstance | null
  /**
   * indicates compiler generated slots
   * we use a reserved property instead of a vnode patchFlag because the slots
   * object may be directly passed down to a child component in a manual
   * render function, and the optimization hint need to be on the slot object
   * itself to be preserved.
   * @internal
   */
  _?: SlotFlags
}

const isInternalKey = (key: string) => key[0] === '_' || key === '$stable'

const normalizeSlotValue = (value: unknown): VNode[] =>
  isArray(value)
    ? value.map(normalizeVNode)
    : [normalizeVNode(value as VNodeChild)]

const normalizeSlot = (
  key: string,
  rawSlot: Function,
  ctx: ComponentInternalInstance | null | undefined,
): Slot => {
  if ((rawSlot as any)._n) {
    // already normalized - #5353
    return rawSlot as Slot
  }
  const normalized = withCtx((...args: any[]) => {
    if (
      __DEV__ &&
      currentInstance &&
      (!ctx || ctx.root === currentInstance.root)
    ) {
      warn(
        `Slot "${key}" invoked outside of the render function: ` +
          `this will not track dependencies used in the slot. ` +
          `Invoke the slot function inside the render function instead.`,
      )
    }
    return normalizeSlotValue(rawSlot(...args))
  }, ctx) as Slot
  // h 函数中通过 normalizeSlot() 会显式的设置
  // withCtx 包装的 slot 函数的 `.c` 标识为 false, 以便将模板编译中调用的 withCtx 设置
  // 经过 withCtx 标识的 `.c` 为 true, 进行区分.
  // slot._c 为 true, 表示来自模板编译调用的 withCtx 包装的 slot 函数
  // slot._c 为 false, 表示不是来自模板编译,而是通过 h函数传入的 slots,
  // 调用的 withCtx 包装的 slot 函数
  // NOT a compiled slot
  ;(normalized as ContextualRenderFn)._c = false
  return normalized
}

const normalizeObjectSlots = (
  rawSlots: RawSlots,
  slots: InternalSlots,
  instance: ComponentInternalInstance,
) => {
  // ctx -> currentRenderingInstance
  // for tracking slot owner instance. This is attached during
  // normalizeChildren when the component vnode is created.
  // _ctx 在组件 vnode 创建时:
  // 在 normalizeChildren 函数中将 currentRenderingInstance 设置到 children._ctx 上
  const ctx = rawSlots._ctx
  // 注意这里的 rawSlots 可以为 null/undefined, 因为
  // for (const key in null) {} 不会报错
  // for (const key in null) {} 也不会报错
  for (const key in rawSlots) {
    // 排除 _, $stable
    if (isInternalKey(key)) continue
    const value = rawSlots[key]
    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx)
    } else if (value != null) {
      if (
        __DEV__ &&
        !(
          __COMPAT__ &&
          isCompatEnabled(DeprecationTypes.RENDER_FUNCTION, instance)
        )
      ) {
        warn(
          `Non-function value encountered for slot "${key}". ` +
            `Prefer function slots for better performance.`,
        )
      }
      const normalized = normalizeSlotValue(value)
      slots[key] = () => normalized
    }
  }
}

const normalizeVNodeSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
) => {
  if (
    __DEV__ &&
    !isKeepAlive(instance.vnode) &&
    !(__COMPAT__ && isCompatEnabled(DeprecationTypes.RENDER_FUNCTION, instance))
  ) {
    warn(
      `Non-function value encountered for default slot. ` +
        `Prefer function slots for better performance.`,
    )
  }
  const normalized = normalizeSlotValue(children)
  instance.slots.default = () => normalized
}

const assignSlots = (
  slots: InternalSlots,
  children: Slots,
  optimized: boolean,
) => {
  // 这里的 children 可以为 null
  // for (const key in null) {} 不会报错
  for (const key in children) {
    // #2893
    // when rendering the optimized slots by manually written render function,
    // do not copy the `slots._` compiler flag so that `renderSlot` creates
    // slot Fragment with BAIL patchFlag to force full updates
    if (optimized || key !== '_') {
      slots[key] = children[key]
    }
  }
}

export const initSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
  optimized: boolean,
): void => {
  // 这里对传入组件的 slots 进行初始化, 其中 slots 来源分为 2 部分:
  // 1. 来自 vue 模板编译生成的 slots, 其中 slot 函数都是使用 withCtx 包装了, 其有 .c 标识为 true
  // 2. 来自 vue h()函数生成的 slots, 此时需要对象 slots 进行 normalization, 最后的函数的 .c 标识为 false
  // 通过返回的 slot 函数的 `.c` 标识来区分是具体某个 slot 来自 h 函数, 还是来自模板编译生成的 slot 函数
  // 总之, 最后都是 normalization 过的 slot 函数, 其 slot 函数返回值都被转成了数组
  // instance.slots = createInternalObject()
  // 下面修改的 slot 都是在修改 instance.slots
  const slots = (instance.slots = createInternalObject())
  // HINT: 这里的 ShapeFlags.SLOTS_CHILDREN 保证了 children 不会是 null
  if (instance.vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    // 传入 children 为对象
    // 有 `_` 属性
    // 有 `_withCtx` 包装后, `foo._c`, `default._c` 这些函数都是有 `._c` 标识
    const type = (children as RawSlots)._
    if (type) {
      // compiled slots. - 无需 normalization (因为在编译器AST生成代码阶段已经进行了 normalization)
      // {
      //   foo: _withCtx(() => [...]), // .c -> true
      //   bar: _withCtx(() => [...]), // .c -> true
      //   car: _withCtx(() => [...]), // .c -> true
      //   default: _withCtx(() => [...]), // .c -> true
      //   _: SlotFlags // ._ -> true
      // }
      // optimized: 默认值为: !!n2.dynamicChildren
      assignSlots(slots, children as Slots, optimized)
      // make compiler marker non-enumerable
      if (optimized) {
        def(slots, '_', type, true)
      }
    } else {
      // 否则是来自 h 函数, 需要重新 normalization
      // h(Foo, null, {
      //   foo: 1,
      //   bar: () => 2,
      //   car: () => [1, 'txt', null, vnode],
      //   default: () => null
      // })
      // ==>
      // h(Foo, null, {
      //   foo: () => normalizeSlotValue(1), // .c -> false
      //   bar: normalizeSlot(withCtx(() => normalizeSlotValue(bar()))), // .c -> false
      //   car: normalizeSlot(withCtx(() => normalizeSlotValue(car()))), // .c -> false
      //   default: normalizeSlot(withCtx(() => normalizeSlotValue(default()))) // .c -> false
      // })

      // normalizeSlotValue() -> 总是返回数组, 也就是最终的 slots 函数的返回值都要转为数组

      // NOTE: 这里的 传入 normalizeObjectSlots 的 children 可以为 null/undefined, 因为
      // for (const key in null) {} 不会报错
      // for (const key in null) {} 也不会报错

      // 手写 render 函数传入的 slots
      normalizeObjectSlots(children as RawSlots, slots, instance)
      // {
      //   const rawSlots = children
      //   for (const key in rawSlots) {
      //     const value = rawSlots[key]
      //     if (isFunction(value)) {
      //       // normalizeSlot h 函数中调用的, 里面也是调用了 withCtx, 但是将 withCtx 返回的函数中的
      //       // normalized._c 重置为 false
      //       slots[key] = normalizeSlot(key, value, ctx) {
      //         const rawSlot = value
      //         const normalized = withCtx(fn = (...args: any[]) => {
      //           return normalizeSlotValue(rawSlot(...args))
      //         } {
      //           if (!ctx) return fn
      //           const renderFnWithContext: ContextualRenderFn = (...args: any[]) => {
      //             if (renderFnWithContext._d) {
      //               setBlockTracking(-1)
      //             }
      //             const prevInstance = setCurrentRenderingInstance(ctx)
      //             let res
      //             try {
      //               res = fn(...args)
      //             } finally {
      //               setCurrentRenderingInstance(prevInstance)
      //               if (renderFnWithContext._d) {
      //                 setBlockTracking(1)
      //               }
      //             }
      //             return res
      //           }
      //           // mark normalized to avoid duplicated wrapping
      //           renderFnWithContext._n = true
      //           // mark this as compiled by default
      //           // this is used in vnode.ts -> normalizeChildren() to set the slot rendering flag.
      //           renderFnWithContext._c = true
      //           // disable block tracking by default
      //           renderFnWithContext._d = true
      //           return renderFnWithContext
      //         }
      //         // h 函数中通过 normalizeSlot() 会显式的设置
      //         // withCtx 包装的 slot 函数的 `.c` 标识为 false, 以便将模板编译中调用的 withCtx 设置
      //         // 经过 withCtx 标识的 `.c` 为 true, 进行区分.
      //         // slot._c 为 true, 表示来自模板编译调用的 withCtx 包装的 slot 函数
      //         // slot._c 为 false, 表示不是来自模板编译,而是通过 h函数传入的 slots,
      //         //调用的 withCtx 包装的 slot 函数
      //         // NOT a compiled slot
      //         ;(normalized as ContextualRenderFn)._c = false
      //         return normalized
      //       })
      //     }
      //   }
      // }
    }
  } else if (children) {
    // h(Foo, null, null)         -> h(Foo, null, { default: () => normalizeSlotValue(null)})
    // h(Foo, null, 'hi')         -> h(Foo, null, { default: () => normalizeSlotValue('hi')})
    // h(Foo, null, ['hi', null]) -> h(Foo, null, { default: () => normalizeSlotValue(['hi', null])})
    // children 不是对象,
    // 默认设置到 instance.slots.default = normalizeSlotValue(children)
    // ShapeFlags.TEXT_CHILDREN
    //  - normalizeVNode('text')
    // ShapeFlags.ARRAY_CHILDREN
    //  - [normalizeVNode(vnode), normalizeVNode(Text), normalizeVNode('txt'), ...]
    normalizeVNodeSlots(instance, children)
  }
}

export const updateSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
  optimized: boolean,
): void => {
  const { vnode, slots } = instance
  let needDeletionCheck = true
  let deletionComparisonTarget = EMPTY_OBJ
  if (vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    const type = (children as RawSlots)._
    if (type) {
      // compiled slots. - 无需 normalization (因为在编译器AST生成代码阶段已经进行了 normalization)
      if (__DEV__ && isHmrUpdating) {
        // Parent was HMR updated so slot content may have changed.
        // force update slots and mark instance for hmr as well
        assignSlots(slots, children as Slots, optimized)
        trigger(instance, TriggerOpTypes.SET, '$slots')
      } else if (optimized && type === SlotFlags.STABLE) {
        // compiled AND stable.
        // no need to update, and skip stale slots removal.
        needDeletionCheck = false
      } else {
        // compiled but dynamic (v-if/v-for on slots) - update slots, but skip
        // normalization.
        assignSlots(slots, children as Slots, optimized)
      }
    } else {
      // 否则是来自 h 函数, 需要重新 normalization
      needDeletionCheck = !(children as RawSlots).$stable
      // 需要对新创建的 vnode 中的 slots 进行 normalization, 老的 vnode 中的 slots 已经 normalization 过了
      normalizeObjectSlots(children as RawSlots, slots, instance)
    }
    deletionComparisonTarget = children as RawSlots
  } else if (children) {
    // non slot object children (direct value) passed to a component
    normalizeVNodeSlots(instance, children)
    deletionComparisonTarget = { default: 1 }
  }

  // delete stale slots
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key]
      }
    }
  }
}
