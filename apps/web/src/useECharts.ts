import { useCallback, useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export function useECharts<T extends echarts.EChartsOption>(option: T) {
  const chartRef = useRef<echarts.ECharts | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const optionRef = useRef(option);
  optionRef.current = option;

  const setRef = useCallback((el: HTMLDivElement | null) => {
    if (elRef.current && chartRef.current) {
      roRef.current?.disconnect();
      chartRef.current.dispose();
      chartRef.current = null;
      roRef.current = null;
    }
    elRef.current = el;
    if (el) {
      const chart = echarts.init(el);
      chartRef.current = chart;
      chart.setOption(optionRef.current);
      const ro = new ResizeObserver(() => chart.resize());
      ro.observe(el);
      roRef.current = ro;
      requestAnimationFrame(() => chart.resize());
    }
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option);
      requestAnimationFrame(() => chartRef.current?.resize());
    }
  }, [option]);

  useEffect(() => {
    return () => {
      roRef.current?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
      roRef.current = null;
    };
  }, []);

  return setRef;
}