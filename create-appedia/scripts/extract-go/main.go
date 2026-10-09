// Command extract-go reads a Go module's non-test sources and writes the
// appedia model (see references/model-schema.md): packages, types, methods,
// functions, the relations between types, and the exact source text of every
// declaration. Standard library only (go/parser, go/ast), so it runs anywhere
// Go 1.22+ does, without building the target module.
//
//	cd scripts/extract-go && go run . -root /path/to/module -out /tmp/model.json
//
// -exclude takes a comma-separated list of directory names to skip
// (vendor, testdata and dot-directories are always skipped).
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Field struct {
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Embedded bool     `json:"embedded,omitempty"`
	Doc      string   `json:"doc,omitempty"`
	Refs     []string `json:"refs,omitempty"` // module types this field's type mentions
}

type Func struct {
	Name     string   `json:"name"`
	Recv     string   `json:"recv,omitempty"` // base type name of the receiver
	PtrRecv  bool     `json:"ptrRecv,omitempty"`
	Sig      string   `json:"sig"`
	Doc      string   `json:"doc,omitempty"`
	File     string   `json:"file"`
	Line     int      `json:"line"`
	EndLine  int      `json:"endLine"`
	Src      string   `json:"src"`
	Exported bool     `json:"exported"`
	Uses     []string `json:"uses,omitempty"` // module types mentioned in signature or body
}

type Type struct {
	Name     string   `json:"name"`
	Kind     string   `json:"kind"` // struct, interface, func, alias, other
	Under    string   `json:"under,omitempty"`
	Doc      string   `json:"doc,omitempty"`
	File     string   `json:"file"`
	Line     int      `json:"line"`
	EndLine  int      `json:"endLine"`
	Src      string   `json:"src"`
	Exported bool     `json:"exported"`
	Fields   []Field  `json:"fields,omitempty"`
	IMethods []Field  `json:"imethods,omitempty"` // interface methods (Type holds the signature)
	Embeds   []string `json:"embeds,omitempty"`
	Methods  []string `json:"methods,omitempty"` // names of methods declared on it
}

type Package struct {
	ID         string           `json:"id"`
	Path       string           `json:"path"` // directory relative to the module root
	ImportPath string           `json:"importPath"`
	Name       string           `json:"name"`
	Doc        string           `json:"doc,omitempty"`
	Files      []FileInfo       `json:"files"`
	Types      map[string]*Type `json:"types"`
	Funcs      map[string]*Func `json:"funcs"` // package-level functions, keyed by name
	Methods    map[string]*Func `json:"methods"`
	Imports    []string         `json:"imports"` // module package IDs this package imports
	Vars       []string         `json:"vars,omitempty"`
}

type FileInfo struct {
	Name  string `json:"name"`
	Lines int    `json:"lines"`
}

type Relation struct {
	From string `json:"from"` // "pkgID.Type"
	To   string `json:"to"`
	Kind string `json:"kind"` // embeds, has, implements
	Via  string `json:"via,omitempty"`
}

type Model struct {
	Language  string              `json:"language"`
	Module    string              `json:"module"`
	Packages  map[string]*Package `json:"packages"`
	Relations []Relation          `json:"relations"`
	UsedBy    map[string][]string `json:"usedBy"` // "pkg.Type" -> ["pkg.Func" | "pkg.Type.Method"]
}

func main() {
	root := flag.String("root", ".", "module root")
	out := flag.String("out", "model.json", "output file")
	exclude := flag.String("exclude", "", "comma-separated directory names to skip")
	flag.Parse()
	skip := map[string]bool{"vendor": true, "testdata": true, "node_modules": true}
	for _, e := range strings.Split(*exclude, ",") {
		if e = strings.TrimSpace(e); e != "" {
			skip[e] = true
		}
	}

	mod, err := modulePath(*root)
	if err != nil {
		fail(err)
	}
	m := &Model{Language: "go", Module: mod, Packages: map[string]*Package{}, UsedBy: map[string][]string{}}

	var dirs []string
	_ = filepath.WalkDir(*root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			n := d.Name()
			if p != *root && (strings.HasPrefix(n, ".") || skip[n]) {
				return filepath.SkipDir
			}
			if p != *root {
				// a nested go.mod is a separate module, as for go build ./...
				if _, err := os.Stat(filepath.Join(p, "go.mod")); err == nil {
					return filepath.SkipDir
				}
			}
			dirs = append(dirs, p)
		}
		return nil
	})

	fset := token.NewFileSet()
	type parsed struct {
		pkg   *Package
		files []*ast.File
		srcs  map[*ast.File][]byte
		names map[*ast.File]string
	}
	var all []*parsed
	byImport := map[string]*Package{}

	for _, dir := range dirs {
		entries, _ := os.ReadDir(dir)
		var gofiles []string
		for _, e := range entries {
			n := e.Name()
			if strings.HasSuffix(n, ".go") && !strings.HasSuffix(n, "_test.go") {
				gofiles = append(gofiles, n)
			}
		}
		if len(gofiles) == 0 {
			continue
		}
		rel, _ := filepath.Rel(*root, dir)
		rel = filepath.ToSlash(rel)
		imp := mod
		if rel != "." {
			imp = mod + "/" + rel
		}
		p := &parsed{srcs: map[*ast.File][]byte{}, names: map[*ast.File]string{}}
		p.pkg = &Package{Path: rel, ImportPath: imp, Types: map[string]*Type{}, Funcs: map[string]*Func{}, Methods: map[string]*Func{}, Imports: []string{}}
		sort.Strings(gofiles)
		for _, n := range gofiles {
			b, err := os.ReadFile(filepath.Join(dir, n))
			if err != nil {
				fail(err)
			}
			f, err := parser.ParseFile(fset, filepath.Join(dir, n), b, parser.ParseComments)
			if err != nil {
				fail(err)
			}
			p.files = append(p.files, f)
			p.srcs[f] = b
			p.names[f] = n
			p.pkg.Name = f.Name.Name
			if f.Doc != nil && p.pkg.Doc == "" {
				p.pkg.Doc = strings.TrimSpace(f.Doc.Text())
			}
			p.pkg.Files = append(p.pkg.Files, FileInfo{Name: n, Lines: bytes.Count(b, []byte("\n")) + 1})
		}
		all = append(all, p)
		byImport[imp] = p.pkg
	}

	// package IDs: the shortest unique trailing path
	assignIDs(all2pkgs(all, func(p *parsed) *Package { return p.pkg }))
	for _, p := range all {
		m.Packages[p.pkg.ID] = p.pkg
	}

	// pass 1: declarations
	for _, p := range all {
		for _, f := range p.files {
			src, fname := p.srcs[f], p.names[f]
			for _, d := range f.Decls {
				switch d := d.(type) {
				case *ast.GenDecl:
					if d.Tok == token.VAR || d.Tok == token.CONST {
						for _, s := range d.Specs {
							for _, n := range s.(*ast.ValueSpec).Names {
								if n.Name != "_" && d.Tok == token.VAR {
									p.pkg.Vars = append(p.pkg.Vars, n.Name)
								}
							}
						}
					}
					if d.Tok != token.TYPE {
						continue
					}
					for _, s := range d.Specs {
						ts := s.(*ast.TypeSpec)
						doc := ts.Doc
						start := ts.Pos()
						if doc == nil && len(d.Specs) == 1 {
							doc = d.Doc
						}
						if doc != nil {
							start = doc.Pos()
						}
						end := ts.End()
						if len(d.Specs) == 1 {
							end = d.End()
							if d.Doc != nil {
								start = d.Doc.Pos()
							}
						}
						t := &Type{
							Name: ts.Name.Name, File: fname, Exported: ts.Name.IsExported(),
							Line: fset.Position(ts.Pos()).Line, EndLine: fset.Position(end).Line,
							Src: slice(fset, src, start, end), Doc: text(doc),
						}
						if len(d.Specs) == 1 && d.Lparen == token.NoPos {
							// "type X struct" on its own: show the keyword too
							t.Src = slice(fset, src, startOf(d.Doc, d.Pos()), d.End())
						}
						switch u := ts.Type.(type) {
						case *ast.StructType:
							t.Kind = "struct"
							for _, fl := range u.Fields.List {
								ty := expr(fset, fl.Type)
								fdoc := text(fl.Doc)
								if fdoc == "" {
									fdoc = text(fl.Comment)
								}
								if len(fl.Names) == 0 {
									t.Fields = append(t.Fields, Field{Name: baseName(fl.Type), Type: ty, Embedded: true, Doc: firstLine(fdoc)})
									t.Embeds = append(t.Embeds, ty)
									continue
								}
								for _, n := range fl.Names {
									t.Fields = append(t.Fields, Field{Name: n.Name, Type: ty, Doc: firstLine(fdoc)})
								}
							}
						case *ast.InterfaceType:
							t.Kind = "interface"
							for _, fl := range u.Methods.List {
								if len(fl.Names) == 0 {
									t.Embeds = append(t.Embeds, expr(fset, fl.Type))
									continue
								}
								for _, n := range fl.Names {
									t.IMethods = append(t.IMethods, Field{Name: n.Name, Type: strings.TrimPrefix(expr(fset, fl.Type), "func"), Doc: firstLine(text(fl.Doc))})
								}
							}
						case *ast.FuncType:
							t.Kind = "func"
							t.Under = expr(fset, u)
						default:
							t.Kind = "other"
							if ts.Assign != token.NoPos {
								t.Kind = "alias"
							}
							t.Under = expr(fset, ts.Type)
						}
						p.pkg.Types[t.Name] = t
					}
				case *ast.FuncDecl:
					fn := &Func{
						Name: d.Name.Name, File: fname, Exported: d.Name.IsExported(),
						Line: fset.Position(d.Pos()).Line, EndLine: fset.Position(d.End()).Line,
						Src: slice(fset, src, startOf(d.Doc, d.Pos()), d.End()), Doc: text(d.Doc),
						Sig: signature(fset, d),
					}
					if d.Recv != nil && len(d.Recv.List) > 0 {
						rt := d.Recv.List[0].Type
						if st, ok := rt.(*ast.StarExpr); ok {
							fn.PtrRecv = true
							rt = st.X
						}
						if ix, ok := rt.(*ast.IndexExpr); ok {
							rt = ix.X
						}
						if id, ok := rt.(*ast.Ident); ok {
							fn.Recv = id.Name
						}
						p.pkg.Methods[fn.Recv+"."+fn.Name] = fn
					} else {
						key := fn.Name
						if key == "init" {
							key = fmt.Sprintf("init@%s:%d", fname, fn.Line)
						}
						p.pkg.Funcs[key] = fn
					}
				}
			}
		}
		for k, fn := range p.pkg.Methods {
			if t := p.pkg.Types[fn.Recv]; t != nil {
				t.Methods = append(t.Methods, fn.Name)
			}
			_ = k
		}
		for _, t := range p.pkg.Types {
			sort.Strings(t.Methods)
		}
	}

	// pass 2: references between module types
	for _, p := range all {
		imports := map[string]bool{}
		for _, f := range p.files {
			alias := aliases(f)
			resolve := func(e ast.Expr) []string { return typeRefs(e, p.pkg, alias, byImport) }
			for _, d := range f.Decls {
				switch d := d.(type) {
				case *ast.GenDecl:
					if d.Tok != token.TYPE {
						continue
					}
					for _, s := range d.Specs {
						ts := s.(*ast.TypeSpec)
						t := p.pkg.Types[ts.Name.Name]
						st, ok := ts.Type.(*ast.StructType)
						if !ok {
							continue
						}
						i := 0
						for _, fl := range st.Fields.List {
							refs := resolve(fl.Type)
							n := max(1, len(fl.Names))
							for k := 0; k < n; k++ {
								fld := &t.Fields[i]
								fld.Refs = refs
								i++
								for _, r := range refs {
									if r == p.pkg.ID+"."+t.Name {
										continue
									}
									kind := "has"
									if fld.Embedded {
										kind = "embeds"
									}
									m.Relations = append(m.Relations, Relation{From: p.pkg.ID + "." + t.Name, To: r, Kind: kind, Via: fld.Name})
								}
							}
						}
					}
				case *ast.FuncDecl:
					var fn *Func
					owner := ""
					if d.Recv != nil && len(d.Recv.List) > 0 {
						rn := recvName(d.Recv.List[0].Type)
						fn = p.pkg.Methods[rn+"."+d.Name.Name]
						owner = p.pkg.ID + "." + rn + "." + d.Name.Name
					} else {
						fn = p.pkg.Funcs[d.Name.Name]
						owner = p.pkg.ID + "." + d.Name.Name
					}
					if fn == nil {
						continue
					}
					seen := map[string]bool{}
					ast.Inspect(d, func(n ast.Node) bool {
						var refs []string
						switch x := n.(type) {
						case *ast.Ident:
							if _, ok := p.pkg.Types[x.Name]; ok {
								refs = []string{p.pkg.ID + "." + x.Name}
							}
						case *ast.SelectorExpr:
							if id, ok := x.X.(*ast.Ident); ok {
								if ip, ok := alias[id.Name]; ok {
									if tp := byImport[ip]; tp != nil {
										if _, ok := tp.Types[x.Sel.Name]; ok {
											refs = []string{tp.ID + "." + x.Sel.Name}
										}
									}
								}
							}
						}
						for _, r := range refs {
							if !seen[r] {
								seen[r] = true
								fn.Uses = append(fn.Uses, r)
								m.UsedBy[r] = append(m.UsedBy[r], owner)
							}
						}
						return true
					})
					sort.Strings(fn.Uses)
				}
			}
			for _, ip := range alias {
				if tp := byImport[ip]; tp != nil && tp != p.pkg {
					imports[tp.ID] = true
				}
			}
		}
		for id := range imports {
			p.pkg.Imports = append(p.pkg.Imports, id)
		}
		sort.Strings(p.pkg.Imports)
	}

	// pass 3: implements (method-name match against module interfaces, with
	// methods promoted from embedded module types)
	methodSet := func(pkg *Package, name string) map[string]bool {
		out := map[string]bool{}
		var walk func(pkg *Package, name string, depth int)
		walk = func(pkg *Package, name string, depth int) {
			t := pkg.Types[name]
			if t == nil || depth > 4 {
				return
			}
			for _, mn := range t.Methods {
				out[mn] = true
			}
			for _, f := range t.Fields {
				if !f.Embedded {
					continue
				}
				for _, r := range f.Refs {
					dot := strings.LastIndex(r, ".")
					if ep := m.Packages[r[:dot]]; ep != nil {
						walk(ep, r[dot+1:], depth+1)
					}
				}
			}
		}
		walk(pkg, name, 0)
		return out
	}
	var ifaces []string
	ifaceMethods := map[string][]string{}
	for _, p := range m.Packages {
		for _, t := range p.Types {
			if t.Kind == "interface" && len(t.IMethods) > 0 {
				id := p.ID + "." + t.Name
				ifaces = append(ifaces, id)
				for _, im := range t.IMethods {
					ifaceMethods[id] = append(ifaceMethods[id], im.Name)
				}
			}
		}
	}
	sort.Strings(ifaces)
	for _, p := range m.Packages {
		for _, t := range p.Types {
			if t.Kind != "struct" && t.Kind != "other" {
				continue
			}
			ms := methodSet(p, t.Name)
			if len(ms) == 0 {
				continue
			}
			for _, id := range ifaces {
				ok := true
				for _, n := range ifaceMethods[id] {
					if !ms[n] {
						ok = false
						break
					}
				}
				if ok {
					m.Relations = append(m.Relations, Relation{From: p.ID + "." + t.Name, To: id, Kind: "implements"})
				}
			}
		}
	}
	sort.Slice(m.Relations, func(i, j int) bool {
		a, b := m.Relations[i], m.Relations[j]
		if a.From != b.From {
			return a.From < b.From
		}
		if a.To != b.To {
			return a.To < b.To
		}
		return a.Kind < b.Kind
	})
	for k, v := range m.UsedBy {
		sort.Strings(v)
		m.UsedBy[k] = dedupe(v)
	}

	b, _ := json.MarshalIndent(m, "", " ")
	if err := os.WriteFile(*out, b, 0o644); err != nil {
		fail(err)
	}
	nt, nf := 0, 0
	for _, p := range m.Packages {
		nt += len(p.Types)
		nf += len(p.Funcs) + len(p.Methods)
	}
	fmt.Printf("%d packages, %d types, %d funcs/methods, %d relations -> %s\n", len(m.Packages), nt, nf, len(m.Relations), *out)
}

func all2pkgs[T any](xs []T, f func(T) *Package) []*Package {
	out := make([]*Package, len(xs))
	for i, x := range xs {
		out[i] = f(x)
	}
	return out
}

// assignIDs gives every package the shortest trailing path that is unique.
func assignIDs(ps []*Package) {
	for depth := 1; ; depth++ {
		count := map[string]int{}
		for _, p := range ps {
			if p.ID == "" {
				count[trail(p.Path, depth)]++
			}
		}
		done := true
		for _, p := range ps {
			if p.ID != "" {
				continue
			}
			id := trail(p.Path, depth)
			if count[id] == 1 {
				p.ID = strings.ReplaceAll(id, "/", "~") // IDs end up in URLs
			} else {
				done = false
			}
		}
		if done || depth > 10 {
			for _, p := range ps {
				if p.ID == "" {
					p.ID = strings.ReplaceAll(p.Path, "/", "~")
				}
			}
			return
		}
	}
}

func trail(path string, n int) string {
	if path == "." {
		return "root"
	}
	parts := strings.Split(path, "/")
	if n > len(parts) {
		n = len(parts)
	}
	return strings.Join(parts[len(parts)-n:], "/")
}

func aliases(f *ast.File) map[string]string {
	out := map[string]string{}
	for _, im := range f.Imports {
		p := strings.Trim(im.Path.Value, `"`)
		name := p[strings.LastIndex(p, "/")+1:]
		if strings.HasSuffix(p, "/v2") {
			s := strings.TrimSuffix(p, "/v2")
			name = s[strings.LastIndex(s, "/")+1:]
		}
		if im.Name != nil {
			name = im.Name.Name
		}
		out[name] = p
	}
	return out
}

func typeRefs(e ast.Expr, pkg *Package, alias map[string]string, byImport map[string]*Package) []string {
	var out []string
	seen := map[string]bool{}
	ast.Inspect(e, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.SelectorExpr:
			if id, ok := x.X.(*ast.Ident); ok {
				if ip, ok := alias[id.Name]; ok {
					if tp := byImport[ip]; tp != nil {
						if _, ok := tp.Types[x.Sel.Name]; ok {
							r := tp.ID + "." + x.Sel.Name
							if !seen[r] {
								seen[r] = true
								out = append(out, r)
							}
						}
					}
				}
			}
			return false
		case *ast.Ident:
			if _, ok := pkg.Types[x.Name]; ok {
				r := pkg.ID + "." + x.Name
				if !seen[r] {
					seen[r] = true
					out = append(out, r)
				}
			}
		}
		return true
	})
	return out
}

func recvName(e ast.Expr) string {
	if st, ok := e.(*ast.StarExpr); ok {
		e = st.X
	}
	if ix, ok := e.(*ast.IndexExpr); ok {
		e = ix.X
	}
	if id, ok := e.(*ast.Ident); ok {
		return id.Name
	}
	return ""
}

func baseName(e ast.Expr) string {
	switch x := e.(type) {
	case *ast.StarExpr:
		return baseName(x.X)
	case *ast.SelectorExpr:
		return x.Sel.Name
	case *ast.Ident:
		return x.Name
	case *ast.IndexExpr:
		return baseName(x.X)
	}
	return "?"
}

func signature(fset *token.FileSet, d *ast.FuncDecl) string {
	cp := *d
	cp.Body = nil
	cp.Doc = nil
	return expr(fset, &cp)
}

func expr(fset *token.FileSet, n ast.Node) string {
	var b bytes.Buffer
	_ = printer.Fprint(&b, fset, n)
	return b.String()
}

func startOf(doc *ast.CommentGroup, p token.Pos) token.Pos {
	if doc != nil {
		return doc.Pos()
	}
	return p
}

func slice(fset *token.FileSet, src []byte, a, b token.Pos) string {
	s, e := fset.Position(a).Offset, fset.Position(b).Offset
	if s < 0 || e > len(src) || s > e {
		return ""
	}
	// start at the beginning of the line so indentation stays right
	for s > 0 && src[s-1] != '\n' {
		s--
	}
	return string(src[s:e])
}

func text(c *ast.CommentGroup) string {
	if c == nil {
		return ""
	}
	return strings.TrimSpace(c.Text())
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

func dedupe(v []string) []string {
	out := v[:0]
	for i, s := range v {
		if i == 0 || s != v[i-1] {
			out = append(out, s)
		}
	}
	return out
}

func modulePath(root string) (string, error) {
	b, err := os.ReadFile(filepath.Join(root, "go.mod"))
	if err != nil {
		return "", err
	}
	for _, l := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(l, "module ") {
			return strings.TrimSpace(strings.TrimPrefix(l, "module ")), nil
		}
	}
	return "", fmt.Errorf("no module line in go.mod")
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "extract:", err)
	os.Exit(1)
}
