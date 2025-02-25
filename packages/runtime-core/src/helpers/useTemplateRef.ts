import { type ShallowRef, readonly, shallowRef } from '@vue/reactivity'
import { getCurrentInstance } from '../component'
import { warn } from '../warning'
import { EMPTY_OBJ } from '@vue/shared'

export const knownTemplateRefs: WeakSet<ShallowRef> = new WeakSet()

export function useTemplateRef<T = unknown, Keys extends string = string>(
  key: Keys,
): Readonly<ShallowRef<T | null>> {
  const i = getCurrentInstance()
  const r = shallowRef(null)
  if (i) {
    const refs = i.refs === EMPTY_OBJ ? (i.refs = {}) : i.refs
    let desc: PropertyDescriptor | undefined
    if (
      __DEV__ &&
      (desc = Object.getOwnPropertyDescriptor(refs, key)) &&
      !desc.configurable
    ) {
      // const ref1 = useTemplateRef('foo')
      // const ref2 = useTemplateRef('foo') -> 提示重复定义,第二个无效
      // Object.getOwnPropertyDescriptor({}, 'a') -> undefined
      // Object.getOwnPropertyDescriptor({a: 1}, 'a') -> { value: 1, writable: true, enumerable: true, configurable: true }
      // 使用下面的 Object.defineProperty 定义的 key, 其 desc.configurable 默认为 false, 这里取 !false, 说明
      // 有使用 Object.defineProperty 给 refs 定义过 key, 故这里提示重复
      warn(`useTemplateRef('${key}') already exists.`)
    } else {
      // 在 setRef() 中执行的读取/设置 i.refs 转发到这里读取/设置 r.value
      // refs[key] 读取操作转发到这里的 r.value
      // refs[key] = refValue => 转发到这里的 r.value = refValue 触发这里 ref 的响应式
      Object.defineProperty(refs, key, {
        enumerable: true,
        get: () => r.value,
        set: val => (r.value = val),
      })
    }
  } else if (__DEV__) {
    warn(
      `useTemplateRef() is called when there is no active component ` +
        `instance to be associated with.`,
    )
  }
  const ret = __DEV__ ? readonly(r) : r
  if (__DEV__) {
    knownTemplateRefs.add(ret)
  }
  return ret
}
