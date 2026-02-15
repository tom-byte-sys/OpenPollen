#!/usr/bin/env python3
"""数据可视化辅助脚本"""

import sys
import json


def main():
    if len(sys.argv) < 2:
        print("用法: visualize.py <data.csv> [chart_type]")
        print("chart_type: bar, line, pie, scatter, hist")
        sys.exit(1)

    data_file = sys.argv[1]
    chart_type = sys.argv[2] if len(sys.argv) > 2 else "bar"

    try:
        import pandas as pd
        import matplotlib.pyplot as plt
        import matplotlib

        matplotlib.use("Agg")

        df = pd.read_csv(data_file)

        print(f"数据概览:")
        print(f"  行数: {len(df)}")
        print(f"  列数: {len(df.columns)}")
        print(f"  列名: {', '.join(df.columns)}")
        print(f"\n统计摘要:")
        print(df.describe().to_string())

        # 生成图表
        fig, ax = plt.subplots(figsize=(10, 6))
        numeric_cols = df.select_dtypes(include=["number"]).columns

        if len(numeric_cols) > 0:
            if chart_type == "bar":
                df[numeric_cols[:5]].plot(kind="bar", ax=ax)
            elif chart_type == "line":
                df[numeric_cols[:5]].plot(kind="line", ax=ax)
            elif chart_type == "hist":
                df[numeric_cols[0]].plot(kind="hist", ax=ax, bins=20)
            elif chart_type == "scatter" and len(numeric_cols) >= 2:
                ax.scatter(df[numeric_cols[0]], df[numeric_cols[1]])
                ax.set_xlabel(numeric_cols[0])
                ax.set_ylabel(numeric_cols[1])

            output_path = data_file.rsplit(".", 1)[0] + f"_{chart_type}.png"
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            print(f"\n图表已保存: {output_path}")

    except ImportError:
        print("需要安装 pandas 和 matplotlib: pip install pandas matplotlib")
        sys.exit(1)


if __name__ == "__main__":
    main()
