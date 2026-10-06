param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing, System.Xml.Linq
    Add-Type -Path (Join-Path $PSScriptRoot 'ClipboardShelf.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Xml.Linq,System.Xml,System.Core
    if ($SelfTest) { [ClipboardShelf.Program]::SelfTest($PSScriptRoot); exit }
    [ClipboardShelf.Program]::Run()
} catch {
    if ($SelfTest) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.ToString(), 'Clipboard Shelf') | Out-Null
    exit 1
}
