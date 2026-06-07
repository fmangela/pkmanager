using System.Reflection;
using PKHeX.Core;

static void DumpType(Type t)
{
    Console.WriteLine($"== {t.FullName} ==");
    foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly)
             .OrderBy(m => m.IsStatic ? 0 : 1)
             .ThenBy(m => m.Name))
    {
        var args = string.Join(", ", m.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}"));
        Console.WriteLine($"{(m.IsStatic ? "static " : "")}{m.ReturnType.Name} {m.Name}({args})");
    }
    Console.WriteLine();
}

DumpType(typeof(SaveUtil));
DumpType(typeof(SaveFileMetadata));
