import {
  TriggerOpTypes,
  shallowReactive,
  shallowReadonly,
  toRaw,
  trigger,
} from '@vue/reactivity'
import {
  EMPTY_ARR,
  EMPTY_OBJ,
  type IfAny,
  PatchFlags,
  camelize,
  capitalize,
  extend,
  hasOwn,
  hyphenate,
  isArray,
  isFunction,
  isObject,
  isOn,
  isReservedProp,
  isString,
  makeMap,
  toRawType,
} from '@vue/shared'
import { warn } from './warning'
import {
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  type Data,
  setCurrentInstance,
} from './component'
import { isEmitListener } from './componentEmits'
import type { AppContext } from './apiCreateApp'
import { createPropsDefaultThis } from './compat/props'
import { isCompatEnabled, softAssertCompatEnabled } from './compat/compatConfig'
import { DeprecationTypes } from './compat/compatConfig'
import { shouldSkipAttr } from './compat/attrsFallthrough'
import { createInternalObject } from './internalObject'

export type ComponentPropsOptions<P = Data> =
  | ComponentObjectPropsOptions<P>
  | string[]

export type ComponentObjectPropsOptions<P = Data> = {
  [K in keyof P]: Prop<P[K]> | null
}

export type Prop<T, D = T> = PropOptions<T, D> | PropType<T>

type DefaultFactory<T> = (props: Data) => T | null | undefined

export interface PropOptions<T = any, D = T> {
  type?: PropType<T> | true | null
  required?: boolean
  default?: D | DefaultFactory<D> | null | undefined | object
  validator?(value: unknown, props: Data): boolean
  /**
   * @internal
   */
  skipCheck?: boolean
  /**
   * @internal
   */
  skipFactory?: boolean
}

export type PropType<T> = PropConstructor<T> | (PropConstructor<T> | null)[]

type PropConstructor<T = any> =
  | { new (...args: any[]): T & {} }
  | { (): T }
  | PropMethod<T>

type PropMethod<T, TConstructor = any> = [T] extends [
  ((...args: any) => any) | undefined,
] // if is function with args, allowing non-required functions
  ? { new (): TConstructor; (): T; readonly prototype: TConstructor } // Create Function like constructor
  : never

type RequiredKeys<T> = {
  [K in keyof T]: T[K] extends
    | { required: true }
    | { default: any }
    // don't mark Boolean props as undefined
    | BooleanConstructor
    | { type: BooleanConstructor }
    ? T[K] extends { default: undefined | (() => undefined) }
      ? never
      : K
    : never
}[keyof T]

type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>

type DefaultKeys<T> = {
  [K in keyof T]: T[K] extends
    | { default: any }
    // Boolean implicitly defaults to false
    | BooleanConstructor
    | { type: BooleanConstructor }
    ? T[K] extends { type: BooleanConstructor; required: true } // not default if Boolean is marked as required
      ? never
      : K
    : never
}[keyof T]

type InferPropType<T, NullAsAny = true> = [T] extends [null]
  ? NullAsAny extends true
    ? any
    : null
  : [T] extends [{ type: null | true }]
    ? any // As TS issue https://github.com/Microsoft/TypeScript/issues/14829 // somehow `ObjectConstructor` when inferred from { (): T } becomes `any` // `BooleanConstructor` when inferred from PropConstructor(with PropMethod) becomes `Boolean`
    : [T] extends [ObjectConstructor | { type: ObjectConstructor }]
      ? Record<string, any>
      : [T] extends [BooleanConstructor | { type: BooleanConstructor }]
        ? boolean
        : [T] extends [DateConstructor | { type: DateConstructor }]
          ? Date
          : [T] extends [(infer U)[] | { type: (infer U)[] }]
            ? U extends DateConstructor
              ? Date | InferPropType<U, false>
              : InferPropType<U, false>
            : [T] extends [Prop<infer V, infer D>]
              ? unknown extends V
                ? keyof V extends never
                  ? IfAny<V, V, D>
                  : V
                : V
              : T

/**
 * Extract prop types from a runtime props options object.
 * The extracted types are **internal** - i.e. the resolved props received by
 * the component.
 * - Boolean props are always present
 * - Props with default values are always present
 *
 * To extract accepted props from the parent, use {@link ExtractPublicPropTypes}.
 */
export type ExtractPropTypes<O> = {
  // use `keyof Pick<O, RequiredKeys<O>>` instead of `RequiredKeys<O>` to
  // support IDE features
  [K in keyof Pick<O, RequiredKeys<O>>]: InferPropType<O[K]>
} & {
  // use `keyof Pick<O, OptionalKeys<O>>` instead of `OptionalKeys<O>` to
  // support IDE features
  [K in keyof Pick<O, OptionalKeys<O>>]?: InferPropType<O[K]>
}

type PublicRequiredKeys<T> = {
  [K in keyof T]: T[K] extends { required: true } ? K : never
}[keyof T]

type PublicOptionalKeys<T> = Exclude<keyof T, PublicRequiredKeys<T>>

/**
 * Extract prop types from a runtime props options object.
 * The extracted types are **public** - i.e. the expected props that can be
 * passed to component.
 */
export type ExtractPublicPropTypes<O> = {
  [K in keyof Pick<O, PublicRequiredKeys<O>>]: InferPropType<O[K]>
} & {
  [K in keyof Pick<O, PublicOptionalKeys<O>>]?: InferPropType<O[K]>
}

enum BooleanFlags {
  shouldCast,
  shouldCastTrue,
}

// extract props which defined with default from prop options
export type ExtractDefaultPropTypes<O> = O extends object
  ? // use `keyof Pick<O, DefaultKeys<O>>` instead of `DefaultKeys<O>` to support IDE features
    { [K in keyof Pick<O, DefaultKeys<O>>]: InferPropType<O[K]> }
  : {}

type NormalizedProp = PropOptions & {
  [BooleanFlags.shouldCast]?: boolean
  [BooleanFlags.shouldCastTrue]?: boolean
}

// normalized value is a tuple of the actual normalized options
// and an array of prop keys that need value casting (booleans and defaults)
export type NormalizedProps = Record<string, NormalizedProp>
export type NormalizedPropsOptions = [NormalizedProps, string[]] | []

export function initProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  isStateful: number, // result of bitwise flag comparison
  isSSR = false,
): void {
  const props: Data = {}
  const attrs: Data = createInternalObject()

  instance.propsDefaults = Object.create(null)

  // rawProps -> instance.props 表示创建 vnode 时传入的 Props
  // h(Foo, rawProps, children), 这里的 rawProps 内部可以传入任意的属性,
  // 需要将 rawProps 进行抽取 若是满足 propsOptions 中需要放入 props, 否在放入 attrs
  // 比如
  // h({ props: ['a', 'd']}, {a: 0, b: 1, c: 2})
  // props: { a: 0 }, attrs: { b: 1, c: 2 }
  setFullProps(instance, rawProps, props, attrs)

  // ensure all declared prop keys are present
  // [NormalizedProps, string[]] | []
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      // 上面的 'd' 不在 { a: 0 } 故这里需要将组件声明的 d 属性放入 props, 即使用户没有传入
      props[key] = undefined
    }
  }
  // props: { a: 0, d: undefined }

  // validation
  if (__DEV__) {
    validateProps(rawProps || {}, props, instance)
  }

  if (isStateful) {
    // stateful (确保 instance.props 为浅的响应式)
    instance.props = isSSR ? props : shallowReactive(props)
  } else {
    // 函数组件 fn = () => rennder()
    // h(fn, rawProps, [])
    if (!instance.type.props) {
      // 若是 fn.props 函数本身没有定义 props, 传入的 rawProps 就全部是 attrs
      // functional w/ optional props, props === attrs
      instance.props = attrs
    } else {
      // 否则有定义 fn.props, 那么这里的 fn.props 就是 传入的 rawProps 对应的 props
      // functional w/ declared props
      instance.props = props
    }
  }
  // attrs 不是响应式的, 这里也包括函数式组件的 attrs
  instance.attrs = attrs
}

function isInHmrContext(instance: ComponentInternalInstance | null) {
  while (instance) {
    if (instance.type.__hmrId) return true
    instance = instance.parent
  }
}

export function updateProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  rawPrevProps: Data | null,
  optimized: boolean,
): void {
  const {
    props,
    attrs,
    vnode: { patchFlag },
  } = instance
  const rawCurrentProps = toRaw(props)
  const [options] = instance.propsOptions
  let hasAttrsChanged = false

  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    !(__DEV__ && isInHmrContext(instance)) &&
    (optimized || patchFlag > 0) &&
    !(patchFlag & PatchFlags.FULL_PROPS)
  ) {
    if (patchFlag & PatchFlags.PROPS) {
      // Compiler-generated props & no keys change, just set the updated
      // the props.
      const propsToUpdate = instance.vnode.dynamicProps!
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i]
        // skip if the prop key is a declared emit event listener
        if (isEmitListener(instance.emitsOptions, key)) {
          continue
        }
        // PROPS flag guarantees rawProps to be non-null
        const value = rawProps![key]
        if (options) {
          // attr / props separation was done on init and will be consistent
          // in this code path, so just check if attrs have it.
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value
              hasAttrsChanged = true
            }
          } else {
            const camelizedKey = camelize(key)
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false /* isAbsent */,
            )
          }
        } else {
          if (__COMPAT__) {
            if (isOn(key) && key.endsWith('Native')) {
              key = key.slice(0, -6) // remove Native postfix
            } else if (shouldSkipAttr(key, instance)) {
              continue
            }
          }
          if (value !== attrs[key]) {
            attrs[key] = value
            hasAttrsChanged = true
          }
        }
      }
    }
  } else {
    // full props update.
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true
    }
    // in case of dynamic props, check if we need to delete keys from
    // the props object
    let kebabKey: string
    for (const key in rawCurrentProps) {
      if (
        !rawProps ||
        // for camelCase
        (!hasOwn(rawProps, key) &&
          // it's possible the original props was passed in as kebab-case
          // and converted to camelCase (#955)
          ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey)))
      ) {
        if (options) {
          if (
            rawPrevProps &&
            // for camelCase
            (rawPrevProps[key] !== undefined ||
              // for kebab-case
              rawPrevProps[kebabKey!] !== undefined)
          ) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              undefined,
              instance,
              true /* isAbsent */,
            )
          }
        } else {
          delete props[key]
        }
      }
    }
    // in the case of functional component w/o props declaration, props and
    // attrs point to the same object so it should already have been updated.
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (
          !rawProps ||
          (!hasOwn(rawProps, key) &&
            (!__COMPAT__ || !hasOwn(rawProps, key + 'Native')))
        ) {
          delete attrs[key]
          hasAttrsChanged = true
        }
      }
    }
  }

  // trigger updates for $attrs in case it's used in component slots
  if (hasAttrsChanged) {
    trigger(instance.attrs, TriggerOpTypes.SET, '')
  }

  if (__DEV__) {
    validateProps(rawProps || {}, props, instance)
  }
}

function setFullProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  props: Data,
  attrs: Data,
) {
  const [options, needCastKeys] = instance.propsOptions
  let hasAttrsChanged = false
  let rawCastValues: Data | undefined
  if (rawProps) {
    for (let key in rawProps) {
      // key, ref are reserved and never passed down
      if (isReservedProp(key)) {
        continue
      }

      if (__COMPAT__) {
        if (key.startsWith('onHook:')) {
          softAssertCompatEnabled(
            DeprecationTypes.INSTANCE_EVENT_HOOKS,
            instance,
            key.slice(2).toLowerCase(),
          )
        }
        if (key === 'inline-template') {
          continue
        }
      }

      const value = rawProps[key]
      // prop option names are camelized during normalization, so to support
      // kebab -> camel conversion here we need to camelize the key.
      let camelKey
      if (options && hasOwn(options, (camelKey = camelize(key)))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          // rawProps: { id: 0,  data: [], "foo-bar": '1', 'bar-foo': '2', onUp: fn }
          // 这里的 camelKey 是在遍历 rawProps 传入的 key, 但是这里在 options 中定义的 key `bo`
          // 没有传入进来
          // needCastKeys = ["id", "bo", "fooBar"]
          // options: { id, data, bo, fooBar}
          props[camelKey] = value
        } else {
          ;(rawCastValues || (rawCastValues = {}))[camelKey] = value
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        // 执行到这里说明 key 不在组件声明的属性中, 那么余下来的 key 就还可能是 emitsOptions 的 key
        // 比如用户传入了 onFooBar 的属性 key, 若是去除了 on 的属性 fooBar 存在于 emitsOptions 中,
        // 那么就表示此 key 是属于 emitsOptions 的事件 key, 此时不应放入 attrs 中
        // Any non-declared (either as a prop or an emitted event) props are put
        // into a separate `attrs` object for spreading. Make sure to preserve
        // original key casing
        // 任何非声明的属性(既不是属性也不是发射的事件) 放入 attrs 中, 其 key 不进行 camelCase 转换
        if (__COMPAT__) {
          if (isOn(key) && key.endsWith('Native')) {
            key = key.slice(0, -6) // remove Native postfix
          } else if (shouldSkipAttr(key, instance)) {
            continue
          }
        }
        // attrs 中 key 没有转 camelCase, 保持原来的 key 形式
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value
          // 这里赋值时, 有比较值是否变化, 若是变化, 这里设置 hasAttrsChanged 为 true
          hasAttrsChanged = true
        }
      }
    }
  }

  // 处理默认值
  if (needCastKeys) {
    const rawCurrentProps = toRaw(props)
    const castValues = rawCastValues || EMPTY_OBJ
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i]
      props[key] = resolvePropValue(
        options!,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        /* 什么场景会出现 isAbsent ?
         * 当传入的 rawProps:
         * propsOptions: { id, data, bo, fooBar}
         * rawProps: { id: 0,  data: [], "foo-bar": '1', 'bar-foo': '2' }
         * 这里的 camelKey 是在遍历 rawProps 传入的 key, 但是这里在 options 中定义的 key `bo`
         * 没有传入进来
         * needCastKeys = ["id", "bo", "fooBar"]
         * options: { id, data, bo, fooBar}
         * 并没有包括组件声明的中属性时, 比如这里的 'bo'
         * 而 needCastKeys = ["id", "bo", "fooBar"] 是包括 'bo'
         * rawCastValues = { id: 0, fooBar: '1' } 不包括 'bo'
         * 所以这里的 bo 是 isAbsent 的
         */
        !hasOwn(castValues, key),
      )
    }
  }

  return hasAttrsChanged
}

function resolvePropValue(
  options: NormalizedProps,
  props: Data,
  key: string,
  value: unknown,
  instance: ComponentInternalInstance,
  isAbsent: boolean,
) {
  const opt = options[key]
  if (opt != null) {
    const hasDefault = hasOwn(opt, 'default')
    // default values
    if (hasDefault && value === undefined) {
      const defaultValue = opt.default
      if (
        opt.type !== Function &&
        !opt.skipFactory &&
        isFunction(defaultValue)
      ) {
        const { propsDefaults } = instance
        if (key in propsDefaults) {
          value = propsDefaults[key]
        } else {
          const reset = setCurrentInstance(instance)
          value = propsDefaults[key] = defaultValue.call(
            __COMPAT__ &&
              isCompatEnabled(DeprecationTypes.PROPS_DEFAULT_THIS, instance)
              ? createPropsDefaultThis(instance, props, key)
              : null,
            props,
          )
          reset()
        }
      } else {
        value = defaultValue
      }
      // #9006 reflect default value on custom element
      if (instance.ce) {
        instance.ce._setProp(key, value)
      }
    }
    // boolean casting
    if (opt[BooleanFlags.shouldCast]) {
      if (isAbsent && !hasDefault) {
        value = false
      } else if (
        // [String, Boolean] - Stirng 在 Boolean 前面
        // 那么空字符会被转为 true, 或者是 value 与 key 相同会被设置为 true
        opt[BooleanFlags.shouldCastTrue] &&
        (value === '' || value === hyphenate(key))
      ) {
        value = true
      }
    }
  }
  return value
}

const mixinPropsCache = new WeakMap<ConcreteComponent, NormalizedPropsOptions>()

export function normalizePropsOptions(
  comp: ConcreteComponent,
  appContext: AppContext,
  asMixin = false,
): NormalizedPropsOptions {
  const cache =
    __FEATURE_OPTIONS_API__ && asMixin ? mixinPropsCache : appContext.propsCache
  const cached = cache.get(comp)
  if (cached) {
    // 将组件声明的 props 进行 normalizePropsOptions 后, 就进行了缓存, 避免了
    // 每次创建同一个组件的不同实例, 都要进行一次 normalization 操作, 这里同一个组件的 propOptions
    // 只进行一次 normalization 操作, 后面相同的组件实例时,只从缓存中取, 避免重复的 normalization
    return cached
  }

  const raw = comp.props
  const normalized: NormalizedPropsOptions[0] = {}
  const needCastKeys: NormalizedPropsOptions[1] = []

  // apply mixin/extends props
  let hasExtends = false
  if (__FEATURE_OPTIONS_API__ && !isFunction(comp)) {
    const extendProps = (raw: ComponentOptions) => {
      if (__COMPAT__ && isFunction(raw)) {
        raw = raw.options
      }
      hasExtends = true
      const [props, keys] = normalizePropsOptions(raw, appContext, true)
      extend(normalized, props)
      if (keys) needCastKeys.push(...keys)
    }
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps)
    }
    if (comp.extends) {
      extendProps(comp.extends)
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps)
    }
  }

  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, EMPTY_ARR as any)
    }
    return EMPTY_ARR as any
  }

  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      if (__DEV__ && !isString(raw[i])) {
        warn(`props must be strings when using array syntax.`, raw[i])
      }
      // props: ['id', 'foo-bar'] -> { id: {}, fooBar: {} }
      // 属性名统一为 驼峰命名
      // 这里的 key 也需要 normalization 就是统一格式为 camelCase
      const normalizedKey = camelize(raw[i]) // fooBar
      if (validatePropName(normalizedKey)) {
        // 声明的属性名称不可以是 key[0] !== '$' 第一个字符是以 $ 开头
        // 声明的属性名不可以是下面的保留字符 - 注意这里的空字符 '' 也是 vue 的保留的内部属性名
        // // the leading comma is intentional so empty string "" is also included
        // ',key,ref,ref_for,ref_key,' +
        // 'onVnodeBeforeMount,onVnodeMounted,' +
        // 'onVnodeBeforeUpdate,onVnodeUpdated,' +
        // 'onVnodeBeforeUnmount,onVnodeUnmounted',
        normalized[normalizedKey] = EMPTY_OBJ
        // { id: {}, fooBar: {} }
      }
    }
  } else if (raw) {
    if (__DEV__ && !isObject(raw)) {
      warn(`invalid props options`, raw)
    }
    // 注意在 for in 中 这里的 raw 即使是 undefined/null 都不会报错
    // for (const key in '') {}
    // for (const key in null) {}
    // for (const key in undefined) {} 都不会报错
    for (const key in raw) {
      const normalizedKey = camelize(key)
      // 首先是 key 的 normalization, 转为驼峰命名
      if (validatePropName(normalizedKey)) {
        const opt = raw[key]
        // props: { id: [String, Number], data: Array,  'foo-bar': { type: String } }
        //              isArray                 isFunction         otherwise
        // 每个属性可以是 数组, 类型函数(String,Boolean,Number,Array, ...), 对象
        const prop: NormalizedProp = (normalized[normalizedKey] =
          isArray(opt) || isFunction(opt) ? { type: opt } : extend({}, opt))
        // 最终转为对象形式: { id: { type: [String, Number] }, data: { type: Array }}
        const propType = prop.type
        let shouldCast = false // 应该类型转换
        let shouldCastTrue = true // 类型转换到 true

        if (isArray(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type = propType[index]
            const typeName = isFunction(type) && type.name

            if (typeName === 'Boolean') {
              shouldCast = true
              break
            } else if (typeName === 'String') {
              // If we find `String` before `Boolean`, e.g. `[String, Boolean]`,
              // we need to handle the casting slightly differently. Props
              // passed as `<Comp checked="">` or `<Comp checked="checked">`
              // will either be treated as strings or converted to a boolean
              // `true`, depending on the order of the types.
              // 表示在多个类型中, String 在 Boolean 前面
              shouldCastTrue = false
            }
          }
        } else {
          // 类型只有一种 并且类型是 Boolean, 那么 shouldCast 为 true
          shouldCast = isFunction(propType) && propType.name === 'Boolean'
        }
        // Boolean: shouldCast = true, shouldCastTrue = true
        // [Boolean, String]: shouldCast = true, shouldCastTrue = true
        // [String, Boolean]: shouldCast = true, shouldCastTrue = false
        // [String, !Boolean]: shouldCast = false, shouldCastTrue = false
        // other: shouldCast = false, shouldCastTrue = true

        prop[BooleanFlags.shouldCast] = shouldCast // 为 true, 属性有 Boolean 类型
        prop[BooleanFlags.shouldCastTrue] = shouldCastTrue
        // 为 true ->  [Boolean, String]
        // 为 false -> [String,  Boolean]
        // if the prop needs boolean casting or default value
        if (shouldCast || hasOwn(prop, 'default')) {
          // 表示有默认值的属性或者是有类型有 Boolean 属性
          needCastKeys.push(normalizedKey)
        }
      }
    }
  }
  // {
  //   id: [String, Number, Boolean],
  //   bo: [Boolean, Number, String],
  //   data: Array,
  //   'foo-bar': { type: String, default: "foo" }
  // }
  // =>
  // [
  //   {
  //     id: {
  //        // 多个类型中, Boolean 在 String 前面
  //        type: [Boolean, Number, String],
  //        [BooleanFlags.shouldCast]: true,
  //        [BooleanFlags.shouldCastTrue]: true // Boolean 在 String 前面
  //     },
  //     bo: {
  //        // 多个类型中, String 在 Boolean 前面
  //        type: [String, Number, Boolean],
  //        [BooleanFlags.shouldCast]: true,
  //        [BooleanFlags.shouldCastTrue]: false // Boolean 在 String 后面
  //     },
  //     data: {
  //        type: Array,
  //        [BooleanFlags.shouldCast]: false,
  //        [BooleanFlags.shouldCastTrue]: true
  //     },
  //     fooBar: {
  //        type: String,
  //        default: "foo",
  //        [BooleanFlags.shouldCast]: false,
  //        [BooleanFlags.shouldCastTrue]: true
  //     }
  //   },
  //   ["id", "bo", "fooBar"] // 最后一个属性放置的是: 有 Boolean 类型的属性, 或者有默认值的属性
  // ]
  const res: NormalizedPropsOptions = [normalized, needCastKeys]
  if (isObject(comp)) {
    cache.set(comp, res)
  }
  return res
}

function validatePropName(key: string) {
  if (key[0] !== '$' && !isReservedProp(key)) {
    return true
  } else if (__DEV__) {
    warn(`Invalid prop name: "${key}" is a reserved property.`)
  }
  return false
}

// dev only
// use function string name to check type constructors
// so that it works across vms / iframes.
function getType(ctor: Prop<any> | null): string {
  // Early return for null to avoid unnecessary computations
  if (ctor === null) {
    return 'null'
  }

  // Avoid using regex for common cases by checking the type directly
  if (typeof ctor === 'function') {
    // Using name property to avoid converting function to string
    return ctor.name || ''
  } else if (typeof ctor === 'object') {
    // Attempting to directly access constructor name if possible
    const name = ctor.constructor && ctor.constructor.name
    return name || ''
  }

  // Fallback for other types (though they're less likely to have meaningful names here)
  return ''
}

/**
 * dev only
 */
function validateProps(
  rawProps: Data,
  props: Data,
  instance: ComponentInternalInstance,
) {
  const resolvedValues = toRaw(props)
  const options = instance.propsOptions[0]
  const camelizePropsKey = Object.keys(rawProps).map(key => camelize(key))
  for (const key in options) {
    let opt = options[key]
    if (opt == null) continue
    validateProp(
      key,
      resolvedValues[key],
      opt,
      __DEV__ ? shallowReadonly(resolvedValues) : resolvedValues,
      !camelizePropsKey.includes(key),
    )
  }
}

/**
 * dev only
 */
function validateProp(
  name: string,
  value: unknown,
  prop: PropOptions,
  props: Data,
  isAbsent: boolean,
) {
  const { type, required, validator, skipCheck } = prop
  // required!
  if (required && isAbsent) {
    warn('Missing required prop: "' + name + '"')
    return
  }
  // missing but optional
  if (value == null && !required) {
    return
  }
  // type check
  if (type != null && type !== true && !skipCheck) {
    let isValid = false
    const types = isArray(type) ? type : [type]
    const expectedTypes = []
    // value is valid as long as one of the specified types match
    for (let i = 0; i < types.length && !isValid; i++) {
      const { valid, expectedType } = assertType(value, types[i])
      expectedTypes.push(expectedType || '')
      isValid = valid
    }
    if (!isValid) {
      warn(getInvalidTypeMessage(name, value, expectedTypes))
      return
    }
  }
  // custom validator
  if (validator && !validator(value, props)) {
    warn('Invalid prop: custom validator check failed for prop "' + name + '".')
  }
}

const isSimpleType = /*@__PURE__*/ makeMap(
  'String,Number,Boolean,Function,Symbol,BigInt',
)

type AssertionResult = {
  valid: boolean
  expectedType: string
}

/**
 * dev only
 */
function assertType(
  value: unknown,
  type: PropConstructor | null,
): AssertionResult {
  let valid
  const expectedType = getType(type)
  if (expectedType === 'null') {
    valid = value === null
  } else if (isSimpleType(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof (type as PropConstructor)
    }
  } else if (expectedType === 'Object') {
    valid = isObject(value)
  } else if (expectedType === 'Array') {
    valid = isArray(value)
  } else {
    valid = value instanceof (type as PropConstructor)
  }
  return {
    valid,
    expectedType,
  }
}

/**
 * dev only
 */
function getInvalidTypeMessage(
  name: string,
  value: unknown,
  expectedTypes: string[],
): string {
  if (expectedTypes.length === 0) {
    return (
      `Prop type [] for prop "${name}" won't match anything.` +
      ` Did you mean to use type Array instead?`
    )
  }
  let message =
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(' | ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

/**
 * dev only
 */
function styleValue(value: unknown, type: string): string {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

/**
 * dev only
 */
function isExplicable(type: string): boolean {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => type.toLowerCase() === elem)
}

/**
 * dev only
 */
function isBoolean(...args: string[]): boolean {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
