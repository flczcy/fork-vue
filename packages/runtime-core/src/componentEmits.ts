import {
  EMPTY_OBJ,
  type OverloadParameters,
  type UnionToIntersection,
  camelize,
  extend,
  hasOwn,
  hyphenate,
  isArray,
  isFunction,
  isObject,
  isOn,
  isString,
  looseToNumber,
  toHandlerKey,
} from '@vue/shared'
import {
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  formatComponentName,
} from './component'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import { warn } from './warning'
import { devtoolsComponentEmit } from './devtools'
import type { AppContext } from './apiCreateApp'
import { emit as compatInstanceEmit } from './compat/instanceEventEmitter'
import {
  compatModelEmit,
  compatModelEventPrefix,
} from './compat/componentVModel'
import type { ComponentTypeEmits } from './apiSetupHelpers'
import { getModelModifiers } from './helpers/useModel'
import type { ComponentPublicInstance } from './componentPublicInstance'

export type ObjectEmitsOptions = Record<
  string,
  ((...args: any[]) => any) | null
>

export type EmitsOptions = ObjectEmitsOptions | string[]

export type EmitsToProps<T extends EmitsOptions | ComponentTypeEmits> =
  T extends string[]
    ? {
        [K in `on${Capitalize<T[number]>}`]?: (...args: any[]) => any
      }
    : T extends ObjectEmitsOptions
      ? {
          [K in string & keyof T as `on${Capitalize<K>}`]?: (
            ...args: T[K] extends (...args: infer P) => any
              ? P
              : T[K] extends null
                ? any[]
                : never
          ) => any
        }
      : {}

export type TypeEmitsToOptions<T extends ComponentTypeEmits> = {
  [K in keyof T & string]: T[K] extends [...args: infer Args]
    ? (...args: Args) => any
    : () => any
} & (T extends (...args: any[]) => any
  ? ParametersToFns<OverloadParameters<T>>
  : {})

type ParametersToFns<T extends any[]> = {
  [K in T[0]]: IsStringLiteral<K> extends true
    ? (
        ...args: T extends [e: infer E, ...args: infer P]
          ? K extends E
            ? P
            : never
          : never
      ) => any
    : never
}

type IsStringLiteral<T> = T extends string
  ? string extends T
    ? false
    : true
  : false

export type ShortEmitsToObject<E> =
  E extends Record<string, any[]>
    ? {
        [K in keyof E]: (...args: E[K]) => any
      }
    : E

export type EmitFn<
  Options = ObjectEmitsOptions,
  Event extends keyof Options = keyof Options,
> =
  Options extends Array<infer V>
    ? (event: V, ...args: any[]) => void
    : {} extends Options // if the emit is empty object (usually the default value for emit) should be converted to function
      ? (event: string, ...args: any[]) => void
      : UnionToIntersection<
          {
            [key in Event]: Options[key] extends (...args: infer Args) => any
              ? (event: key, ...args: Args) => void
              : Options[key] extends any[]
                ? (event: key, ...args: Options[key]) => void
                : (event: key, ...args: any[]) => void
          }[Event]
        >

export function emit(
  instance: ComponentInternalInstance,
  event: string,
  ...rawArgs: any[]
): ComponentPublicInstance | null | undefined {
  if (instance.isUnmounted) return
  const props = instance.vnode.props || EMPTY_OBJ

  if (__DEV__) {
    const {
      emitsOptions,
      propsOptions: [propsOptions],
    } = instance
    if (emitsOptions) {
      if (
        !(event in emitsOptions) &&
        !(
          __COMPAT__ &&
          (event.startsWith('hook:') ||
            event.startsWith(compatModelEventPrefix))
        )
      ) {
        if (!propsOptions || !(toHandlerKey(camelize(event)) in propsOptions)) {
          warn(
            `Component emitted event "${event}" but it is neither declared in ` +
              `the emits option nor as an "${toHandlerKey(camelize(event))}" prop.`,
          )
        }
      } else {
        const validator = emitsOptions[event]
        if (isFunction(validator)) {
          const isValid = validator(...rawArgs)
          if (!isValid) {
            warn(
              `Invalid event arguments: event validation failed for event "${event}".`,
            )
          }
        }
      }
    }
  }

  let args = rawArgs
  const isModelListener = event.startsWith('update:')

  // for v-model update:xxx events, apply modifiers on args
  const modifiers = isModelListener && getModelModifiers(props, event.slice(7))
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map(a => (isString(a) ? a.trim() : a))
    }
    if (modifiers.number) {
      args = rawArgs.map(looseToNumber)
    }
  }

  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    devtoolsComponentEmit(instance, event, args)
  }

  if (__DEV__) {
    // emit("fooBar")
    const lowerCaseEvent = event.toLowerCase()
    if (lowerCaseEvent !== event && props[toHandlerKey(lowerCaseEvent)]) {
      // props["onFoobar"]
      warn(
        // foobar -> fooBar
        `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(
            instance,
            instance.type,
          )} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(
            event, // foo-bar, fooBar
          )}" instead of "${event}".`,
      )
    }
  }

  let handlerName
  let handler =
    // emit("fooBar") -> props["onFooBar"]
    // emit("update:fooBar") -> props["onUpdate:fooBar"]
    props[(handlerName = toHandlerKey(event))] ||
    // also try camelCase event handler (#2249)
    // emit("foo-bar") -> props["onFooBar"]
    props[(handlerName = toHandlerKey(camelize(event)))]

  // <F v-model='c'/>
  // return (_openBlock(), _createBlock(_component_F, {
  //   modelValue: _ctx.c, // 新增一个 modelValue 属性
  //   "onUpdate:modelValue": $event => ((_ctx.c) = $event)
  // }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]))

  // <F v-model:foo.mod='c'/>
  // return (_openBlock(), _createBlock(_component_F, {
  //   foo: _ctx.c, // 新增一个 foo 属性
  //   "onUpdate:foo": $event => ((_ctx.c) = $event),
  //   fooModifiers: { mod: true } // 新增一个 fooModifiers 属性
  // }, null, 8 /* PROPS */, ["foo", "onUpdate:foo"]))

  // <F v-model:foo-bar.mod='c'/>
  // return (_openBlock(), _createBlock(_component_F, {
  //   "foo-bar": _ctx.c,
  //   "onUpdate:fooBar": $event => ((_ctx.c) = $event),
  //   "foo-barModifiers": { mod: true }
  // }, null, 8 /* PROPS */, ["foo-bar", "onUpdate:fooBar"]))

  // <F v-model:foo-bar.mod1.mod2='val'/>
  // return (_openBlock(), _createBlock(_component_F, {
  //   "foo-bar": _ctx.val,
  //   "onUpdate:fooBar": $event => ((_ctx.val) = $event),
  //   "foo-barModifiers": { mod1: true, mod2: true }
  // }, null, 8 /* PROPS */, ["foo-bar", "onUpdate:fooBar"]))
  // 在 Foo 组件中, 可以执行 this.$emit('update:modelValue', val)
  // <input
  //   :value="props['foo-bar']"
  //   @input="$emit('update:fooBar', $event.target.value)"
  // />

  // for v-model update:xxx events, also trigger kebab-case equivalent
  // for props passed via kebab-case
  if (!handler && isModelListener) {
    // 手动传入属性
    // h(Foo, {
    //   'foo-bar': _ctx.val, // 用于接收的初始值
    //   'onUpdate:foo-bar': $event => (_ctx.val = $event),
    // })
    // 在 Foo 组件中
    // <input
    //   :value="props['foo-bar']" // 接收来自组件的属性 'foo-bar' 的初始值
    //   @input="$emit('update:fooBar', $event.target.value)" // 通知组件更新 'foo-bar' 属性的值
    // />
    // 此时需要 'update:fooBar' -> 'onUpdate:foo-bar'  才可以在属性中找到对应的事件函数
    handler = props[(handlerName = toHandlerKey(hyphenate(event)))]
  }

  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args,
    )
  }

  const onceHandler = props[handlerName + `Once`]
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {}
    } else if (instance.emitted[handlerName]) {
      return
    }
    instance.emitted[handlerName] = true
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args,
    )
  }

  if (__COMPAT__) {
    compatModelEmit(instance, event, args)
    return compatInstanceEmit(instance, event, args)
  }
}

export function normalizeEmitsOptions(
  comp: ConcreteComponent,
  appContext: AppContext,
  asMixin = false,
): ObjectEmitsOptions | null {
  const cache = appContext.emitsCache
  const cached = cache.get(comp)
  if (cached !== undefined) {
    return cached
  }

  const raw = comp.emits
  let normalized: ObjectEmitsOptions = {}

  // apply mixin/extends props
  let hasExtends = false
  if (__FEATURE_OPTIONS_API__ && !isFunction(comp)) {
    const extendEmits = (raw: ComponentOptions) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw, appContext, true)
      if (normalizedFromExtend) {
        hasExtends = true
        extend(normalized, normalizedFromExtend)
      }
    }
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits)
    }
    if (comp.extends) {
      extendEmits(comp.extends)
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits)
    }
  }

  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, null)
    }
    return null
  }

  if (isArray(raw)) {
    raw.forEach(key => (normalized[key] = null))
  } else {
    extend(normalized, raw)
  }

  if (isObject(comp)) {
    cache.set(comp, normalized)
  }
  return normalized
}

// Check if an incoming prop key is a declared emit event listener.
// e.g. With `emits: { click: null }`, props named `onClick` and `onclick` are
// both considered matched listeners.
export function isEmitListener(
  options: ObjectEmitsOptions | null,
  key: string,
): boolean {
  // {
  //   name: "Foo",
  //   emits: {
  //     click: null,
  //     "foo-bar": null,
  //   },
  // }
  // <Foo @foo-bar="fn" /> or <Foo @fooBar="fn" /> 都可以, 内部都是使用驼峰式的事件名查找
  // props: { onFooBar: fn }
  // emit("foo-bar", args) -> 查找事件名 -> 转成驼峰 -> 查找事件名

  // emits: { click: null, "foo-bar": null, foo: null }
  if (!options || !isOn(key)) {
    return false
  }

  if (__COMPAT__ && key.startsWith(compatModelEventPrefix)) {
    return true
  }

  // v-on:foo.once="fn" -> { onFooOnce: fn }
  // v-on:foo-bar.once="fn" -> { onFooBarOnce: fn }
  key = key.slice(2).replace(/Once$/, '')
  // onFooBarOnce -> FooBar
  return (
    // FooBar -> fooBar
    hasOwn(options, key[0].toLowerCase() + key.slice(1)) ||
    // FooBar -> foo-bar
    hasOwn(options, hyphenate(key)) ||
    // FooBar
    hasOwn(options, key)
  )
}
