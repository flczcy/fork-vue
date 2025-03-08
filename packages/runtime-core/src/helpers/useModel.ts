import { type Ref, customRef, ref } from '@vue/reactivity'
import { EMPTY_OBJ, camelize, hasChanged, hyphenate } from '@vue/shared'
import type { DefineModelOptions, ModelRef } from '../apiSetupHelpers'
import { getCurrentInstance } from '../component'
import { warn } from '../warning'
import type { NormalizedProps } from '../componentProps'
import { watchSyncEffect } from '../apiWatch'

/*
 * https://play.vuejs.org/
 * useModel 作为 setup defineModel 编译宏的转换基础
 */

export function useModel<
  M extends PropertyKey,
  T extends Record<string, any>,
  K extends keyof T,
  G = T[K],
  S = T[K],
>(
  props: T,
  name: K,
  options?: DefineModelOptions<T[K], G, S>,
): ModelRef<T[K], M, G, S>
export function useModel(
  props: Record<string, any>,
  name: string,
  options: DefineModelOptions = EMPTY_OBJ,
): Ref {
  const i = getCurrentInstance()!
  if (__DEV__ && !i) {
    warn(`useModel() called without active instance.`)
    return ref() as any
  }

  // <Foo v-model="foo" />
  // return (_openBlock(), _createBlock(_component_Foo, {
  //   modelValue: _ctx.foo,
  //   "onUpdate:modelValue": $event => ((_ctx.foo) = $event)
  // }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]))

  // <Foo v-model:foo.mod="foo" />
  // return (_openBlock(), _createBlock(_component_Foo, {
  //   foo: _ctx.foo,
  //   "onUpdate:foo": $event => ((_ctx.foo) = $event),
  //   fooModifiers: { mod: true }
  // }, null, 8 /* PROPS */, ["foo", "onUpdate:foo"]))

  // {
  //   name: 'Foo',
  //   props: ['foo'],
  //   setup(props) {
  //     // 传入的属性 foo 变化了, 触发 model 内部的 trigger
  //     // props.foo -> model.trigger() -> 更新视图
  //     const model = useModel(props, 'foo')
  //     // model.value 被 input 修改了内部会触发事件发送给父组件
  //     // 父组件接收到事件后, 触发 props.foo 的更新
  //     // props.foo -> model.trigger() -> 更新视图
  //     return h('input', {
  //       value: model.value,
  //       onInput: e => model.value = e.target.value
  //     })
  //   }
  //   // input 输入修改 model.value 会触发内部事件 emit(`update:foo`, value)
  //   template: `<input v-model="model.value" />`
  // }

  // usesModel(
  //   {
  //     modelModifiers: { mod: true },
  //     fooBarModifiers: { mod: true },
  //     "foo-barModifiers": { mod: true },
  //   },
  //   "fooBar"
  // ), // name 必须是组件中声明的属性

  const camelizedName = camelize(name)
  // instance.propsOptions 中的 key 都是 camelCase
  if (__DEV__ && !(i.propsOptions[0] as NormalizedProps)[camelizedName]) {
    warn(`useModel() called with prop "${name}" which is not declared.`)
    return ref() as any
  }

  const hyphenatedName = hyphenate(name)
  const modifiers = getModelModifiers(props, camelizedName /* modelName */)
  // {
  //   return modelName === 'modelValue'
  //     ? props.modelModifiers
  //     : props[`${modelName}Modifiers`] ||
  //         props[`${camelize(modelName)}Modifiers`] ||
  //         props[`${hyphenate(modelName)}Modifiers`]
  // }

  //
  const res = customRef((track, trigger) => {
    // 默认会创建一个 dep
    // 执行 track() 会执行内部创建的 dep.track()
    // 执行 trigger() 会执行内部创建的 dep.trigger()

    let localValue: any
    let prevSetValue: any = EMPTY_OBJ
    let prevEmittedValue: any

    // 传入 customRef(fn) 这里的函数只会执行一次

    // 等价 watch(source, null, { flush: 'sync' })
    watchSyncEffect(() => {
      // 这里只要 props[camelizedName] 变化了, 就会执行这里的函数
      // props[camelizedName] -> trigger()
      const propValue = props[camelizedName]
      if (hasChanged(localValue, propValue)) {
        localValue = propValue
        trigger()
      }
    })

    // 返回 getter 和 setter,
    // 当 ref.value ->       执行这里的 getter 同时执行 track() -> dep.track()
    // 当 ref.value = xxx -> 执行这里的 setter 同时执行 trigger() -> dep.trigger()
    return {
      get() {
        track()
        return options.get ? options.get(localValue) : localValue
      },

      // const [modelValue, modelModifiers] = defineModel({
      //   // get() 省略了，因为这里不需要它
      //   set(value) {
      //     // 如果使用了 .trim 修饰符，则返回裁剪过后的值
      //     if (modelModifiers.trim) {
      //       return value.trim()
      //     }
      //     // 否则，原样返回
      //     return value
      //   }
      // })

      // const [modelValue, modelModifiers] = _useModel(__props, "modelValue", {
      //   // get() 省略了，因为这里不需要它
      //   set(value) {
      //     // 如果使用了 .trim 修饰符，则返回裁剪过后的值
      //     if (modelModifiers.trim) {
      //       return value.trim()
      //     }
      //     // 否则，原样返回
      //     return value
      //   }
      // })

      set(value) {
        const emittedValue = options.set ? options.set(value) : value
        if (
          !hasChanged(emittedValue, localValue) &&
          !(prevSetValue !== EMPTY_OBJ && hasChanged(value, prevSetValue))
        ) {
          // prevSetValue !== EMPTY_OBJ 已经设置过一次值了
          // value 是新设置的值 与上次设置的值相同 !hasChanged(value, prevSetValue)
          // 新设置的值与上次设置的值相同, 不触发更新
          return
        }
        const rawProps = i.vnode!.props
        if (
          !(
            rawProps &&
            // check if parent has passed v-model
            (name in rawProps ||
              camelizedName in rawProps ||
              hyphenatedName in rawProps) &&
            (`onUpdate:${name}` in rawProps ||
              `onUpdate:${camelizedName}` in rawProps ||
              `onUpdate:${hyphenatedName}` in rawProps)
          )
        ) {
          // no v-model, local update
          localValue = value
          trigger()
        }
        // 触发事件 -> 设置 localValue = emittedValue
        // 触发父组件的状态更新
        i.emit(`update:${name}`, emittedValue)
        // #10279: if the local value is converted via a setter but the value
        // emitted to parent was the same, the parent will not trigger any
        // updates and there will be no prop sync. However the local input state
        // may be out of sync, so we need to force an update here.
        if (
          hasChanged(value, emittedValue) &&
          hasChanged(value, prevSetValue) &&
          !hasChanged(emittedValue, prevEmittedValue)
        ) {
          trigger()
        }
        prevSetValue = value
        prevEmittedValue = emittedValue
      },
    }
  })

  // for (const s of res) {
  //   console.log(s)
  // }
  // 0 -> res
  // 1 -> modifiers || EMPTY_OBJ
  // const iter = res[Symbol.iterator]()
  // console.log(iter.next()) { value: res, done: false }
  // console.log(iter.next()) { value: modifiers || EMPTY_OBJ, done: false }
  // console.log(iter.next()) { done: true }
  // console.log(iter.next()) { done: true }

  // 可以直接解构 iterator
  // const [a, b]= res
  // console.log(a) -> res
  // console.log(b) -> modifiers || EMPTY_OBJ
  // 但是不可以通过 res[0], res[1] 获取 res
  // console.log(res[0]) -> undefined

  // @ts-expect-error
  res[Symbol.iterator] = () => {
    let i = 0
    return {
      next() {
        if (i < 2) {
          // i = 0 -> { value: res, done: false }
          // i = 1 -> { value: modifiers || EMPTY_OBJ, done: false }
          // i = 2 -> { done: true }
          return { value: i++ ? modifiers || EMPTY_OBJ : res, done: false }
        } else {
          return { done: true }
        }
      },
    }
  }

  return res
}

export const getModelModifiers = (
  props: Record<string, any>,
  modelName: string,
): Record<string, boolean> | undefined => {
  return modelName === 'modelValue' || modelName === 'model-value'
    ? props.modelModifiers
    : props[`${modelName}Modifiers`] ||
        props[`${camelize(modelName)}Modifiers`] ||
        props[`${hyphenate(modelName)}Modifiers`]
}
