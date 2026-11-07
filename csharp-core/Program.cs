using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using CSharpCoreBrowser;
using CSharpCoreBrowser.Source;
using Microsoft.JSInterop;
var builder=WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
var host=builder.Build();
MainFlashWebRuntime.Initialize(host.Services.GetRequiredService<IJSRuntime>());
await host.RunAsync();