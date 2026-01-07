import { createConfigUtils } from './config-utils'
import { mergeClassList } from './merge-classlist'
import { ClassNameValue, twJoin } from './tw-join'
import { AnyConfig } from './types'

type CreateConfigFirst = () => AnyConfig
type CreateConfigSubsequent = (config: AnyConfig) => AnyConfig
type TailwindMerge = (...classLists: ClassNameValue[]) => string
type ConfigUtils = ReturnType<typeof createConfigUtils>

export const createTailwindMerge = (
    createConfigFirst: CreateConfigFirst,
    ...createConfigRest: CreateConfigSubsequent[]
): TailwindMerge => {
    let configUtils: ConfigUtils
    let cacheGet: ConfigUtils['cache']['get']
    let cacheSet: ConfigUtils['cache']['set']
    let functionToCall: (classList: string) => string

    const initTailwindMerge = (classList: string) => {
        const config = createConfigRest.reduce(
            (previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig),
            createConfigFirst() as AnyConfig,
        )

        configUtils = createConfigUtils(config)
        cacheGet = configUtils.cache.get
        cacheSet = configUtils.cache.set
        functionToCall = tailwindMerge

        return tailwindMerge(classList)
    }

    const tailwindMerge = (classList: string) => {
        const cachedResult = cacheGet(classList)

        if (cachedResult) {
            return cachedResult
        }

        const result = mergeClassList(classList, configUtils)
        cacheSet(classList, result)

        return result
    }

    functionToCall = initTailwindMerge

    return (...args: ClassNameValue[]) => functionToCall(twJoin(...args))
}
