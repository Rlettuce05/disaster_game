var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/scenarios", () => new[]
{
    new { id = "earthquake", name = "Earthquake", durationSeconds = 30 },
    new { id = "flood", name = "Flood", durationSeconds = 45 },
});

app.Run();
