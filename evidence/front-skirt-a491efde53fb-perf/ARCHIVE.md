完整逐帧 report.json 以 report.json.gz 无损备份；原JSON仍在本机但不重复纳入Git。summary.json保存原文件及压缩文件SHA，已验证解压字节完全相同。新检出后可用 Python gzip.decompress 还原 report.json，再运行原manifest或分析脚本。原始manifest内report.json的SHA仍为有效还原校验值。
