# Web 运行、升级与恢复

## 启动参数

```bash
passagen-web serve \
  --data-dir PATH \
  --config FILE \
  --host 127.0.0.1 \
  --port 8765 \
  --no-open \
  --allow-origin URL
```

`--data-dir` 必填。`--config` 默认指向 `<data-dir>/passagen.yaml`。`--allow-origin` 可重复使用，
其值必须是浏览器页面的完整 origin。

## 本地与网络访问

仅本机使用时保留默认 host：

```bash
passagen-web serve --data-dir /path/to/library
```

局域网或反向代理访问时显式设置监听地址、端口和 browser origin：

```bash
passagen-web serve \
  --data-dir /path/to/library \
  --host 192.168.1.110 \
  --port 8765 \
  --no-open \
  --allow-origin https://papers.example.com
```

不要把客户端设备 IP 当作 origin。origin 是浏览器地址栏中的 scheme、host、port 组合。

## 配置和重启

Web 与 CLI 使用同一个 YAML。完整字段见
Passagen Core 仓库的 docs/user/configuration.md。

服务只读取启动时继承的环境变量。修改 API key 或配置后必须重启。源码开发和前端构建见
[开发构建指南](../development/building.md)；部署新前端后刷新浏览器，仍显示旧资源时执行
hard refresh。

## 备份与升级

1. 停止 Web 和使用同一 data directory 的写入命令。
2. 备份完整 data directory。
3. 升级兼容的 Core、CLI 和 Web。
4. 使用 CLI 运行 `passagen --data-dir PATH db init`。
5. 运行 `passagen --data-dir PATH artifacts check`。
6. 重新启动 Web，检查 Library、PDF 和 processing run。

## 恢复

Schema 不兼容时不要通过 Web 修改数据库。安装匹配版本完成 migration，或停止所有 Passagen
进程后恢复完整备份。不要只把旧 `passagen.db` 覆盖到较新的 artifact 目录。

`.passagen-web.lock` 是进程锁的辅助状态。进程崩溃后操作系统会释放实际 lock；不要删除它来
绕过仍在运行的服务。
