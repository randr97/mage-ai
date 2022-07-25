from .constants import (
    AggregationFunction,
    VARIABLE_NAME_X,
    VARIABLE_NAME_Y,
)
from mage_ai.shared.parsers import encode_complex
import numpy as np
import pandas as pd


def convert_to_list(arr, limit=None):
    if type(arr) in [pd.Index, pd.RangeIndex, pd.Series]:
        return arr[:limit].tolist()
    elif type(arr) is pd.DataFrame:
        return arr[:limit].to_numpy().tolist()
    elif type(arr) is np.ndarray:
        return arr[:limit].tolist()
    elif type(arr) is list:
        return [convert_to_list(arr2) for arr2 in arr]

    return arr


def encode_values_in_list(arr):
    return [encode_complex(v) for v in arr]


def build_metric_name(metric):
    aggregation = metric['aggregation']
    column = metric['column']
    return f'{aggregation}({column})'


def calculate_metrics_for_group(metrics, group):
    values = {}

    for metric in metrics:
        aggregation = metric['aggregation']
        column = metric['column']
        series = group[column]
        value = 0

        if AggregationFunction.AVERAGE == aggregation:
            value = sum(series) / len(series)
        elif AggregationFunction.COUNT == aggregation:
            value = len(series)
        elif AggregationFunction.COUNT_DISTINCT == aggregation:
            value = len(series.unique())
        elif AggregationFunction.MAX == aggregation:
            value = max(series)
        elif AggregationFunction.MEDIAN == aggregation:
            value = sorted(series)[int(len(series) / 2)]
        elif AggregationFunction.MIN == aggregation:
            value = min(series)
        elif AggregationFunction.MODE == aggregation:
            value = sorted(
                series.value_counts().items(),
                key=lambda t: t[1],
                reverse=True,
            )[0][0]
        elif AggregationFunction.SUM == aggregation:
            value = sum(series)

        values[build_metric_name(metric)] = value

    return values


def build_x_y(df, group_by_columns, metrics):
    data = {}
    groups = df.groupby(group_by_columns)
    data[VARIABLE_NAME_X] = list(groups.groups.keys())

    metrics_per_group = groups.apply(
        lambda group: calculate_metrics_for_group(metrics, group),
    ).values

    y_values = []
    for idx, metric in enumerate(metrics):
        y_values.append([g[build_metric_name(metric)] for g in metrics_per_group])

    data[VARIABLE_NAME_Y] = y_values

    return data