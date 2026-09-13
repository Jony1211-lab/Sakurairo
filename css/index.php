<?php
/**
 * 主题样式合并/压缩出口。
 *
 * 在原实时压缩的基础上增加静态缓存：产物落在 cache/ 目录，
 * 任一源文件更新后自动失效重建；目录不可写时回退为实时压缩。
 * URL 形如 /css/?参数，浏览器侧缓存策略不变。
 */
header("Content-Type: text/css; charset=UTF-8");
header("Cache-Control: public, max-age=86400");
header("Expires: " . gmdate("D, d M Y H:i:s", time() + 86400) . " GMT");

$style_files = [
    '../style.css',
    'shortcodes.css',
    'dark.css',
    'responsive.css',
    'animation.css',
    'templates.css'
];

if (isset($_GET['sakura_header'])) {
    $style_files[] = 'sakura_header.css';
}
if (isset($_GET['wave'])) {
    $style_files[] = 'wave.css';
}
if (isset($_GET['github'])) {
    $style_files[] = './content-style/github.css';
}
if (isset($_GET['sakura'])) {
    $style_files[] = './content-style/sakura.css';
}

$minify = isset($_GET['minify']); // 是否压缩

function compressCSS($css) {
    // 移除注释、换行和多余空格
    $css = preg_replace("/\/\*.*?\*\//s", "", $css); // 移除注释
    $css = preg_replace("/\s*([{};:,])\s*/", "$1", $css); // 移除空格
    $css = preg_replace("/;}/", "}", $css); // 修正分号
    return trim($css);
}

// ---- 静态缓存：以参数+源文件 mtime 构建缓存键 ----
$cache_dir = __DIR__ . '/cache';
$cache_usable = is_dir($cache_dir) || @mkdir($cache_dir, 0755, true);
$cache_file = '';

if ($cache_usable) {
    $key = isset($_SERVER['QUERY_STRING']) ? $_SERVER['QUERY_STRING'] : '';
    $latest_mtime = 0;
    foreach ($style_files as $style) {
        $mtime = @filemtime(__DIR__ . '/' . $style);
        if ($mtime > $latest_mtime) {
            $latest_mtime = $mtime;
        }
    }
    $cache_file = $cache_dir . '/style-' . md5($key . '|' . $latest_mtime) . '.css';

    if (file_exists($cache_file)) {
        echo file_get_contents($cache_file);
        return;
    }

    // 清理旧版本缓存文件，避免目录无限增长
    foreach (glob($cache_dir . '/style-*.css') ?: [] as $old) {
        if ($old !== $cache_file) {
            @unlink($old);
        }
    }
}

$output = "";
foreach ($style_files as $style) {
    $file_path = __DIR__ . '/' . $style;
    if (file_exists($file_path)) {
        $content = file_get_contents($file_path);

        // 添加文件名注释
        $output .= "\n/* === " . basename($style) . " === */\n";

        if ($minify) {
            $output .= compressCSS($content);
        } else {
            $output .= $content;
        }
    }
}

echo $output;

if ($cache_file !== '') {
    @file_put_contents($cache_file, $output);
}
?>
