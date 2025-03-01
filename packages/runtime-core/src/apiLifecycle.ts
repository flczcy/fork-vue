import {
  type ComponentInternalInstance,
  currentInstance,
  isInSSRComponentSetup,
  setCurrentInstance,
} from './component'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { ErrorTypeStrings, callWithAsyncErrorHandling } from './errorHandling'
import { warn } from './warning'
import { toHandlerKey } from '@vue/shared'
import {
  type DebuggerEvent,
  pauseTracking,
  resetTracking,
} from '@vue/reactivity'
import { LifecycleHooks } from './enums'

export { onActivated, onDeactivated } from './components/KeepAlive'

// 当 onBeforeMount 在 setup 执行时, 此时的 currentInstance 是存在的, 其默认参数就是捕获了 currentInstance
// setup() {
//   这里的  onBeforeMount 只传入了一个参数, 那么此时的第二个参数 target 默认就是 currentInstance
//   onBeforeMount(() => { ... })
//   => 等价于
//   const instance = getCurrentInstance()
//   这里调用明确传入了第二个参数 target 为 当前 setup 上下文中的 currentInstance, 与第一种等价
//   onBeforeMount(() => { ... }, instance)
//   这里在 setup 中获取的 currentInstance 传入 onBeforeMount(hook, instance) 后, 被其内部的包装函数
//   捕获为当前执行时的闭包(onBeforeMount 在不同的组件 setup 中执行, 捕获的是不同 setup 中的闭包)
//   onBeforeMount 这些钩子函数可以任意执行多次, 不同的上下文中, 通过传入第二个参数来捕获不同执行上下文的闭包
//   onBeforeMount(hook, instance) {
//     const wrappedHook = (...args) => {
//       // 内部函数捕获传入的参数闭包 target
//       // 这里再次将外部函数**执行时** 捕获的闭包再次设置到 currentInstance
//       // 这样就保证了每次执行这些 lifecycle 注册的回调函数时,
//       // 内部可以通过 getCurrentInstance() 获取到对应组件的 instance
//       pauseTracking()
//       const reset = setCurrentInstance(target)
//       const res = hook(...args) // 这里执行用户的回调函数钩子
//       // 用户的 lifecycle 注册的回调函数执行完后,再次将 currentInstance 更新回去
//       reset()
//       resetTracking()
//     }
//     instances.bm.push(wrappedHook)
//     将函数返回出去, 避免执行完后, 被销毁, 其实这里已经 push 到 bm 数组中了, 不返回也是可以的
//     return wrappedHook
//   }
// }
// onBeforeMount(() => { ... })
export function injectHook(
  type: LifecycleHooks,
  hook: Function & { __weh?: Function },
  // 注意这里 target 默认值的闭包
  target: ComponentInternalInstance | null = currentInstance,
  prepend: boolean = false,
): Function | undefined {
  if (target) {
    const hooks = target[type] || (target[type] = [])
    // cache the error handling wrapper for injected hooks so the same hook
    // can be properly deduped by the scheduler. "__weh" stands for "with error
    // handling".
    const wrappedHook =
      hook.__weh ||
      (hook.__weh = (...args: unknown[]) => {
        // disable tracking inside all lifecycle hooks
        // since they can potentially be called inside effects.
        pauseTracking()
        // Set currentInstance during hook invocation.
        // This assumes the hook does not synchronously trigger other hooks, which
        // can only be false when the user does something really funky.
        const reset = setCurrentInstance(target)
        const res = callWithAsyncErrorHandling(hook, target, type, args)
        reset()
        resetTracking()
        return res
      })
    if (prepend) {
      hooks.unshift(wrappedHook)
    } else {
      hooks.push(wrappedHook)
    }
    return wrappedHook
  } else if (__DEV__) {
    const apiName = toHandlerKey(ErrorTypeStrings[type].replace(/ hook$/, ''))
    warn(
      `${apiName} is called when there is no active component instance to be ` +
        `associated with. ` +
        `Lifecycle injection APIs can only be used during execution of setup().` +
        (__FEATURE_SUSPENSE__
          ? ` If you are using async setup(), make sure to register lifecycle ` +
            `hooks before the first await statement.`
          : ``),
    )
  }
}
// onBeforeMount(fn() {
//   ...
// }, target) {
//   targer 默认为 currentInstance
//   injectHook('bm', hook(...args) => fn(...args), target = currentInstance) {
//     hooks = target.bm || (target.bm = [])
//     hook(...args) {
//        return fn(...args)
//     }
//   }
// }
const createHook =
  <T extends Function = () => any>(lifecycle: LifecycleHooks) =>
  (
    hook: T,
    target: ComponentInternalInstance | null = currentInstance,
  ): void => {
    // post-create lifecycle registrations are noops during SSR (except for serverPrefetch)
    if (
      !isInSSRComponentSetup ||
      lifecycle === LifecycleHooks.SERVER_PREFETCH
    ) {
      // server render 中没有这些 lifecycle 钩子
      injectHook(lifecycle, (...args: unknown[]) => hook(...args), target)
    }
  }
type CreateHook<T = any> = (
  hook: T,
  target?: ComponentInternalInstance | null,
) => void

export const onBeforeMount: CreateHook = createHook(LifecycleHooks.BEFORE_MOUNT)
export const onMounted: CreateHook = createHook(LifecycleHooks.MOUNTED)
export const onBeforeUpdate: CreateHook = createHook(
  LifecycleHooks.BEFORE_UPDATE,
)
export const onUpdated: CreateHook = createHook(LifecycleHooks.UPDATED)
export const onBeforeUnmount: CreateHook = createHook(
  LifecycleHooks.BEFORE_UNMOUNT,
)
export const onUnmounted: CreateHook = createHook(LifecycleHooks.UNMOUNTED)
export const onServerPrefetch: CreateHook = createHook(
  LifecycleHooks.SERVER_PREFETCH,
)

export type DebuggerHook = (e: DebuggerEvent) => void
export const onRenderTriggered: CreateHook<DebuggerHook> =
  createHook<DebuggerHook>(LifecycleHooks.RENDER_TRIGGERED)
export const onRenderTracked: CreateHook<DebuggerHook> =
  createHook<DebuggerHook>(LifecycleHooks.RENDER_TRACKED)

export type ErrorCapturedHook<TError = unknown> = (
  err: TError,
  instance: ComponentPublicInstance | null,
  info: string,
) => boolean | void

export function onErrorCaptured<TError = Error>(
  hook: ErrorCapturedHook<TError>,
  target: ComponentInternalInstance | null = currentInstance,
): void {
  injectHook(LifecycleHooks.ERROR_CAPTURED, hook, target)
}
