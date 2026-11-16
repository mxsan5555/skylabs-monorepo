# Uses the built-in Windows PDF renderer. Reads only local verification artifacts.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
function Await-Result($operation, $resultType) {
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    $task = $method.MakeGenericMethod($resultType).Invoke($null,@($operation))
    return $task.GetAwaiter().GetResult()
}
function Await-Action($operation) {
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
    $task = $method.Invoke($null,@($operation))
    $task.GetAwaiter().GetResult()
}
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'artifacts'))
foreach ($name in @('driver-partial','driver-complete','driver-complete-with-trips','booking-invoice')) {
    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Join-Path $artifactRoot "$name.pdf"))) ([Windows.Storage.StorageFile])
    $pdf = Await-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
    Write-Output "$name : $($pdf.PageCount) pages"
    for ($index = 0; $index -lt $pdf.PageCount; $index++) {
        $page = $pdf.GetPage($index)
        $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
        Await-Action ($page.RenderToStreamAsync($stream)) | Out-Null
        $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
        Await-Result ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]) | Out-Null
        $bytes = New-Object byte[] ([int]$stream.Size)
        $reader.ReadBytes($bytes)
        [IO.File]::WriteAllBytes((Join-Path $artifactRoot "$name-page-$($index+1).png"),$bytes)
        $reader.Dispose(); $stream.Dispose(); $page.Dispose()
    }
}
