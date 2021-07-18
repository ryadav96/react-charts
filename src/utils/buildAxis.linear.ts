import { extent, max, median, min, range as d3Range } from 'd3-array'
import {
  scaleLinear,
  scaleLog,
  scaleTime,
  scaleUtc,
  scaleBand,
  ScaleTime,
  ScaleLinear,
} from 'd3-scale'

import {
  Axis,
  AxisBand,
  AxisBandOptions,
  AxisLinear,
  AxisLinearOptions,
  AxisOptions,
  AxisTime,
  AxisTimeOptions,
  BuildAxisOptions,
  GridDimensions,
  ResolvedAxisOptions,
  Series,
} from '../types'

function defaultAxisOptions<TDatum>(
  options: BuildAxisOptions<TDatum>
): ResolvedAxisOptions<AxisOptions<TDatum>> {
  return {
    ...options,
    elementType: options.elementType ?? 'line',
    minTickPaddingForRotation: options.minTickPaddingForRotation ?? 10,
    tickLabelRotationDeg: options.tickLabelRotationDeg ?? 60,
    innerBandPadding: options.innerBandPadding ?? 0.6,
    outerBandPadding: options.outerBandPadding ?? 0.2,
    show: options.show ?? true,
    stacked: options.stacked ?? false,
  }
}

export default function buildAxisLinear<TDatum>(
  isPrimary: boolean,
  userOptions: BuildAxisOptions<TDatum>,
  series: Series<TDatum>[],
  gridDimensions: GridDimensions,
  width: number,
  height: number
): Axis<TDatum> {
  const options = defaultAxisOptions(userOptions)

  if (!options.position) {
    throw new Error(`Chart axes must have a valid 'position' property`)
  }

  const isVertical = ['left', 'right'].indexOf(options.position) > -1

  // Now we need to figure out the range
  const range: [number, number] = isVertical
    ? [gridDimensions.gridHeight, 0]
    : [0, gridDimensions.gridWidth]

  const outerRange: [number, number] = isVertical ? [height, 0] : [0, width]

  // Give the scale a home
  return options.scaleType === 'time' || options.scaleType === 'localTime'
    ? buildTimeAxis(isPrimary, options, series, isVertical, range, outerRange)
    : options.scaleType === 'linear' || options.scaleType === 'log'
    ? buildLinearAxis(isPrimary, options, series, isVertical, range, outerRange)
    : options.scaleType === 'band'
    ? buildBandAxis(options, series, isVertical, range, outerRange)
    : (() => {
        throw new Error('Invalid scale type')
      })()
}

function buildTimeAxis<TDatum>(
  isPrimary: boolean,
  options: ResolvedAxisOptions<AxisTimeOptions<TDatum>>,
  series: Series<TDatum>[],
  isVertical: boolean,
  range: [number, number],
  outerRange: [number, number]
): AxisTime<TDatum> {
  const scaleFn = options.scaleType === 'localTime' ? scaleTime : scaleUtc

  // Now set the range
  const scale = scaleFn(range)

  const allDatums = series.map(d => d.datums).flat()

  let [minValue, maxValue] = extent(allDatums, datum =>
    options.getValue(datum.originalDatum)
  )

  let shouldNice = true

  if (typeof options.min === 'number') {
    minValue = min([options.min, minValue as Date])
    shouldNice = false
  }

  if (typeof options.max === 'number') {
    maxValue = max([options.max, maxValue as Date])
    shouldNice = false
  }

  if (typeof options.hardMin === 'number') {
    minValue = options.hardMin
    shouldNice = false
  }

  if (typeof options.hardMax === 'number') {
    maxValue = options.hardMax
    shouldNice = false
  }

  if (minValue === undefined || maxValue === undefined) {
    console.info({
      options,
      series,
      range,
      values: allDatums.map(d => options.getValue(d.originalDatum)),
    })
    throw new Error('Invalid scale min/max')
  }

  // Set the domain
  scale.domain([minValue as Date, maxValue as Date])

  if (options.invert) {
    scale.domain(Array.from(scale.domain()).reverse())
  }

  if (shouldNice) {
    scale.nice()
  }

  const outerScale = scale.copy().range(outerRange)

  // Supplmentary band scale
  const bandScale = isPrimary
    ? buildImpliedBandScale(options, scale, series, range)
    : undefined

  const defaultFormat = scale.tickFormat()

  const formatters = {} as AxisTime<TDatum>['formatters']

  const scaleFormat = (value: Date) =>
    options.formatters?.scale?.(value, { ...formatters, scale: undefined }) ??
    defaultFormat(value)

  const tooltipFormat = (value: Date) =>
    options.formatters?.tooltip?.(value, {
      ...formatters,
      tooltip: undefined,
    }) ?? scaleFormat(value)

  const cursorFormat = (value: Date) =>
    options.formatters?.cursor?.(value, { ...formatters, cursor: undefined }) ??
    tooltipFormat(value)

  Object.assign(formatters, {
    default: defaultFormat,
    scale: scaleFormat,
    tooltip: tooltipFormat,
    cursor: cursorFormat,
  })

  return {
    ...options,
    axisFamily: 'time',
    isVertical,
    scale,
    range,
    outerScale,
    bandScale,
    formatters: formatters,
  }
}

function buildLinearAxis<TDatum>(
  isPrimary: boolean,
  options: ResolvedAxisOptions<AxisLinearOptions<TDatum>>,
  series: Series<TDatum>[],
  isVertical: boolean,
  range: [number, number],
  outerRange: [number, number]
): AxisLinear<TDatum> {
  const scale = options.scaleType === 'log' ? scaleLog() : scaleLinear()

  const allDatums = series.map(d => d.datums).flat(2)

  let [minValue, maxValue] = options.stacked
    ? extent(
        series
          .map(s => s.datums.map(datum => datum.stackData ?? []))
          .flat(2) as unknown as number[]
      )
    : extent(allDatums, datum => options.getValue(datum.originalDatum))

  let shouldNice = true

  if (typeof options.min === 'number') {
    minValue = min([options.min, minValue as number])
    shouldNice = false
  }

  if (typeof options.max === 'number') {
    maxValue = max([options.max, maxValue as number])
    shouldNice = false
  }

  if (
    typeof options.minDomainLength === 'number' &&
    !(minValue === undefined || maxValue === undefined)
  ) {
    const mid = median([minValue, maxValue])!
    const top = mid + options.minDomainLength / 2
    const bottom = mid - options.minDomainLength / 2
    maxValue = Math.max(top, maxValue)
    minValue = Math.min(bottom, minValue)
  }

  if (typeof options.hardMin === 'number') {
    minValue = options.hardMin
    shouldNice = false
  }

  if (typeof options.hardMax === 'number') {
    maxValue = options.hardMax
    shouldNice = false
  }

  if (minValue === undefined || maxValue === undefined) {
    console.info({
      options,
      series,
      range,
      values: allDatums.map(d => options.getValue(d.originalDatum)),
    })
    throw new Error('Invalid scale min/max')
  }

  // Set the domain
  scale.domain([minValue, maxValue])

  if (options.invert) {
    scale.domain(Array.from(scale.domain()).reverse())
  }

  scale.range(range)

  if (shouldNice) {
    scale.nice()
  }

  const outerScale = scale.copy().range(outerRange)

  const bandScale = isPrimary
    ? buildImpliedBandScale(options, scale, series, range)
    : undefined

  const defaultFormat = scale.tickFormat()

  const formatters = {} as AxisLinear<TDatum>['formatters']

  const scaleFormat = (value: number) =>
    options.formatters?.scale?.(value, { ...formatters, scale: undefined }) ??
    defaultFormat(value)

  const tooltipFormat = (value: number) =>
    options.formatters?.tooltip?.(value, {
      ...formatters,
      tooltip: undefined,
    }) ?? scaleFormat(value)

  const cursorFormat = (value: number) =>
    options.formatters?.cursor?.(value, { ...formatters, cursor: undefined }) ??
    tooltipFormat(value)

  Object.assign(formatters, {
    default: defaultFormat,
    scale: scaleFormat,
    tooltip: tooltipFormat,
    cursor: cursorFormat,
  })

  return {
    ...options,
    axisFamily: 'linear',
    isVertical,
    scale,
    range,
    outerScale,
    bandScale,
    formatters,
  }
}

function buildBandAxis<TDatum>(
  options: ResolvedAxisOptions<AxisBandOptions<TDatum>>,
  series: Series<TDatum>[],
  isVertical: boolean,
  range: [number, number],
  outerRange: [number, number]
): AxisBand<TDatum> {
  const domain = Array.from(
    new Set(
      series
        .map(d => d.datums)
        .flat()
        .map(datum => options.getValue(datum.originalDatum))
    )
  )

  const scale = scaleBand(domain, range)
    .round(false)
    .paddingOuter(options.outerBandPadding ?? 0)
    .paddingInner(options.innerBandPadding ?? 0)

  // Invert if necessary
  if (options.invert) {
    scale.domain(Array.from(scale.domain()).reverse())
  }

  const outerScale = scale.copy().range(outerRange)

  const defaultFormat = (d: { toString: () => string }) => d

  const formatters = {} as AxisBand<TDatum>['formatters']

  const scaleFormat = (value: number) =>
    options.formatters?.scale?.(value, { ...formatters, scale: undefined }) ??
    defaultFormat(value)

  const tooltipFormat = (value: number) =>
    options.formatters?.tooltip?.(value, {
      ...formatters,
      tooltip: undefined,
    }) ?? scaleFormat(value)

  const cursorFormat = (value: number) =>
    options.formatters?.cursor?.(value, { ...formatters, cursor: undefined }) ??
    tooltipFormat(value)

  Object.assign(formatters, {
    default: defaultFormat,
    scale: scaleFormat,
    tooltip: tooltipFormat,
    cursor: cursorFormat,
  })

  return {
    ...options,
    axisFamily: 'band',
    isVertical,
    scale,
    range,
    outerScale,
    formatters,
  }
}

//

function buildImpliedBandScale<TDatum>(
  options: ResolvedAxisOptions<AxisOptions<TDatum>>,
  scale: ScaleTime<number, number, never> | ScaleLinear<number, number, never>,
  series: Series<TDatum>[],
  range: [number, number]
) {
  // Find the two closest points along axis

  let impliedBandWidth: number = Math.max(...range)

  series.forEach(serie => {
    serie.datums.forEach(d1 => {
      const one = scale(options.getValue(d1.originalDatum) ?? NaN)

      serie.datums.forEach(d2 => {
        const two = scale(options.getValue(d2.originalDatum) ?? NaN)

        if (one === two) {
          return
        }

        const r = [one, two].sort()

        const diff = Math.abs(r[1] - r[0])

        if (diff < impliedBandWidth) {
          impliedBandWidth = diff
        }
      })
    })
  })

  const bandRange = Math.max(...range)

  const bandDomain = d3Range(bandRange / impliedBandWidth)

  const bandScale = scaleBand(bandDomain, range)
    .round(false)
    .paddingOuter(options.outerBandPadding ?? 0)
    .paddingInner(options.innerBandPadding ?? 0)

  return bandScale
}
