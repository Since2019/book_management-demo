param([string]$OutputName = 'ClipboardShelf.exe')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, System.Xml.Linq
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot $OutputName)) {
    Remove-Item -LiteralPath (Join-Path $PSScriptRoot $OutputName)
}
Add-Type -Path (Join-Path $PSScriptRoot 'ClipboardShelf.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Xml.Linq,System.Xml,System.Core -OutputAssembly (Join-Path $PSScriptRoot $OutputName) -OutputType WindowsApplication
