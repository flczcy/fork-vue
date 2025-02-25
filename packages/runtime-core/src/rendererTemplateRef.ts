import type { SuspenseBoundary } from './components/Suspense'
import type { VNode, VNodeNormalizedRef, VNodeNormalizedRefAtom } from './vnode'
import {
  EMPTY_OBJ,
  ShapeFlags,
  hasOwn,
  isArray,
  isFunction,
  isString,
  remove,
} from '@vue/shared'
import { isAsyncWrapper } from './apiAsyncComponent'
import { warn } from './warning'
import { isRef, toRaw } from '@vue/reactivity'
import { ErrorCodes, callWithErrorHandling } from './errorHandling'
import type { SchedulerJob } from './scheduler'
import { queuePostRenderEffect } from './renderer'
import { type ComponentOptions, getComponentPublicInstance } from './component'
import { knownTemplateRefs } from './helpers/useTemplateRef'

/**
 * Function for handling a template ref
 */
export function setRef(
  rawRef: VNodeNormalizedRef,
  oldRawRef: VNodeNormalizedRef | null,
  parentSuspense: SuspenseBoundary | null,
  vnode: VNode,
  isUnmount = false,
): void {
  if (isArray(rawRef)) {
    rawRef.forEach((r, i) =>
      setRef(
        r,
        oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount,
      ),
    )
    return
  }

  if (isAsyncWrapper(vnode) && !isUnmount) {
    // #4999 if an async component already resolved and cached by KeepAlive,
    // we need to set the ref to inner component
    if (
      vnode.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE &&
      (vnode.type as ComponentOptions).__asyncResolved &&
      vnode.component!.subTree.component
    ) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component!.subTree)
    }

    // otherwise, nothing needs to be done because the template ref
    // is forwarded to inner component
    return
  }

  const refValue =
    vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT
      ? // ref 在组件 vnode 上,返回组件实例
        getComponentPublicInstance(vnode.component!)
      : // ref 在元素 vnode 上,返回获取元素
        vnode.el
  // isUnmount 参数为 true, 表示在 onmount 中调用
  const value = isUnmount ? null : refValue

  // i: 表示创建 ref 所在的 vnode 那时捕获的组件实例
  const { i: owner, r: ref } = rawRef
  if (__DEV__ && !owner) {
    warn(
      `Missing ref owner context. ref cannot be used on hoisted vnodes. ` +
        `A vnode with ref must be created inside the render function.`,
    )
    return
  }
  const oldRef = oldRawRef && (oldRawRef as VNodeNormalizedRefAtom).r
  const refs = owner.refs === EMPTY_OBJ ? (owner.refs = {}) : owner.refs
  const setupState = owner.setupState
  const rawSetupState = toRaw(setupState)
  const canSetSetupRef =
    setupState === EMPTY_OBJ
      ? () => false
      : (key: string) => {
          if (__DEV__) {
            if (hasOwn(rawSetupState, key) && !isRef(rawSetupState[key])) {
              warn(
                `Template ref "${key}" used on a non-ref value. ` +
                  `It will not work in the production build.`,
              )
            }

            if (knownTemplateRefs.has(rawSetupState[key] as any)) {
              return false
            }
          }
          return hasOwn(rawSetupState, key)
        }

  // dynamic ref changed. unset old ref
  // 把老的 ref 设置为 null, 使用新的替换
  if (oldRef != null && oldRef !== ref) {
    if (isString(oldRef)) {
      refs[oldRef] = null
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null
      }
    } else if (isRef(oldRef)) {
      oldRef.value = null
    }
  }

  if (isFunction(ref)) {
    callWithErrorHandling(ref, owner, ErrorCodes.FUNCTION_REF, [value, refs])
  } else {
    const _isString = isString(ref)
    const _isRef = isRef(ref)

    if (_isString || _isRef) {
      const doSet = () => {
        // f 为 v-for 循环中的 ref 标识
        // <li v-for="it of items" ref="items">
        if (rawRef.f) {
          const existing = _isString
            ? canSetSetupRef(ref)
              ? setupState[ref]
              : refs[ref]
            : ref.value
          if (isUnmount) {
            // 卸载
            isArray(existing) && remove(existing, refValue)
          } else {
            if (!isArray(existing)) {
              if (_isString) {
                refs[ref] = [refValue]
                if (canSetSetupRef(ref)) {
                  // 触发 effect - 放在 nextTick
                  setupState[ref] = refs[ref]
                }
              } else {
                // 触发 effect - 放在 nextTick
                ref.value = [refValue]
                if (rawRef.k) refs[rawRef.k] = ref.value
              }
            } else if (!existing.includes(refValue)) {
              // 这里若是在 setupState 则是响应式的
              existing.push(refValue)
            }
          }
        } else if (_isString) {
          refs[ref] = value
          if (canSetSetupRef(ref)) {
            // 触发 effect
            setupState[ref] = value
          }
        } else if (_isRef) {
          // 触发 effect
          ref.value = value
          if (rawRef.k) refs[rawRef.k] = value
        } else if (__DEV__) {
          warn('Invalid template ref type:', ref, `(${typeof ref})`)
        }
      }
      if (value) {
        // #1789: for non-null values, set them after render
        // null values means this is unmount and it should not overwrite another
        // ref with the same key
        ;(doSet as SchedulerJob).id = -1
        queuePostRenderEffect(doSet, parentSuspense)
      } else {
        doSet()
      }
    } else if (__DEV__) {
      warn('Invalid template ref type:', ref, `(${typeof ref})`)
    }
  }
}
