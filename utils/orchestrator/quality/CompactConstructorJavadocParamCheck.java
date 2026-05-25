import com.sun.source.doctree.DocCommentTree;
import com.sun.source.doctree.ParamTree;
import com.sun.source.doctree.ReturnTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.ModifiersTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.DocTrees;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import javax.lang.model.element.Modifier;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * Validate Javadoc tag completeness for documented public APIs that Qodana flags more strictly than
 * PMD's built-in documentation rules.
 *
 * <p>This currently covers documented public methods missing {@code @param} and non-void
 * {@code @return} tags, documented public records missing record-component {@code @param} tags,
 * documented record canonical constructors missing {@code @param} tags for their record components,
 * and public constants missing Javadocs.
 */
public final class CompactConstructorJavadocParamCheck {

  private record RecordContext(String name, List<String> componentNames) {}

  private record Violation(Path file, long line, String message) {}

  private CompactConstructorJavadocParamCheck() {}

  /**
   * Runs the Javadoc tag-completeness validation.
   *
   * @param args expects exactly one argument: the Java source root to scan
   * @throws Exception when source parsing fails
   */
  public static void main(String[] args) throws Exception {
    if (args.length != 1) {
      throw new IllegalArgumentException("Expected exactly one argument: <source-root>");
    }

    Path sourceRoot = Paths.get(args[0]).toAbsolutePath().normalize();
    List<Path> javaFiles = collectJavaFiles(sourceRoot);
    if (javaFiles.isEmpty()) {
      return;
    }

    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null) {
      throw new IllegalStateException("No system Java compiler is available");
    }

    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
    try (StandardJavaFileManager fileManager =
        compiler.getStandardFileManager(diagnostics, Locale.ROOT, null)) {
      Iterable<? extends JavaFileObject> units = fileManager.getJavaFileObjectsFromPaths(javaFiles);
      JavacTask task =
          (JavacTask)
              compiler.getTask(null, fileManager, diagnostics, List.of("-proc:none"), null, units);
      Iterable<? extends CompilationUnitTree> parsedUnits = task.parse();
      DocTrees docTrees = DocTrees.instance(task);
      List<Violation> violations = new ArrayList<>();

      for (CompilationUnitTree unit : parsedUnits) {
        new PublicApiJavadocTagScanner(docTrees, unit, violations).scan(unit, new ArrayDeque<>());
      }

      if (violations.isEmpty()) {
        return;
      }

      violations.stream()
          .sorted(Comparator.comparing(Violation::file).thenComparingLong(Violation::line))
          .forEach(
              violation ->
                  System.err.println(
                      violation.file() + ":" + violation.line() + ": " + violation.message()));
      System.exit(1);
    }
  }

  private static List<Path> collectJavaFiles(Path sourceRoot) throws IOException {
    try (Stream<Path> paths = Files.walk(sourceRoot)) {
      return paths
          .filter(Files::isRegularFile)
          .filter(path -> path.toString().endsWith(".java"))
          .sorted()
          .toList();
    }
  }

  private static final class PublicApiJavadocTagScanner
      extends TreePathScanner<Void, Deque<RecordContext>> {

    private final DocTrees docTrees;
    private final CompilationUnitTree unit;
    private final List<Violation> violations;

    private PublicApiJavadocTagScanner(
        DocTrees docTrees, CompilationUnitTree unit, List<Violation> violations) {
      this.docTrees = docTrees;
      this.unit = unit;
      this.violations = violations;
    }

    @Override
    public Void visitClass(ClassTree classTree, Deque<RecordContext> recordStack) {
      boolean isRecord = classTree.getKind().name().equals("RECORD");
      if (isRecord) {
        List<String> componentNames = resolveRecordComponentNames(classTree);
        recordStack.push(new RecordContext(classTree.getSimpleName().toString(), componentNames));
        reportMissingRecordComponentTags(classTree, componentNames);
      }

      super.visitClass(classTree, recordStack);

      if (isRecord) {
        recordStack.pop();
      }
      return null;
    }

    @Override
    public Void visitMethod(MethodTree methodTree, Deque<RecordContext> recordStack) {
      if (!isEffectivelyPublic(methodTree.getModifiers(), getCurrentPath())) {
        return super.visitMethod(methodTree, recordStack);
      }

      DocCommentTree methodDoc = docTrees.getDocCommentTree(getCurrentPath());
      if (methodDoc == null) {
        return super.visitMethod(methodTree, recordStack);
      }

      Set<String> documentedParams = extractJavadocParamNames(methodDoc);
      boolean hasReturnTag = hasReturnTag(methodDoc);
      RecordContext currentRecord = recordStack.peek();

      if (isCanonicalRecordConstructor(methodTree, currentRecord)) {
        reportMissingParamTags(
            methodTree,
            currentRecord.componentNames(),
            documentedParams,
            "Record canonical constructor '" + currentRecord.name() + "'");
        return super.visitMethod(methodTree, recordStack);
      }

      if (methodTree.getReturnType() == null) {
        return super.visitMethod(methodTree, recordStack);
      }

      List<String> expectedParams =
          methodTree.getParameters().stream().map(param -> param.getName().toString()).toList();
      reportMissingParamTags(
          methodTree, expectedParams, documentedParams, "Method '" + methodTree.getName() + "'");
      if (requiresReturnTag(methodTree) && !hasReturnTag) {
        reportViolation(
            methodTree, "Method '" + methodTree.getName() + "' is missing an @return tag");
      }
      return super.visitMethod(methodTree, recordStack);
    }

    @Override
    public Void visitVariable(VariableTree variableTree, Deque<RecordContext> recordStack) {
      if (!isDocumentedPublicConstant(variableTree, getCurrentPath())) {
        return super.visitVariable(variableTree, recordStack);
      }

      if (docTrees.getDocCommentTree(getCurrentPath()) == null) {
        reportViolation(
            variableTree, "Public constant '" + variableTree.getName() + "' is missing Javadoc");
      }
      return super.visitVariable(variableTree, recordStack);
    }

    private void reportMissingParamTags(
        MethodTree methodTree,
        List<String> expectedParams,
        Set<String> documentedParams,
        String methodLabel) {
      if (expectedParams.isEmpty()) {
        return;
      }

      List<String> missingParams =
          expectedParams.stream()
              .filter(paramName -> !documentedParams.contains(paramName))
              .toList();
      if (missingParams.isEmpty()) {
        return;
      }

      reportViolation(
          methodTree,
          methodLabel + " is missing @param tags for: " + String.join(", ", missingParams));
    }

    private void reportViolation(Tree tree, String message) {
      long startPosition = docTrees.getSourcePositions().getStartPosition(unit, tree);
      long line = unit.getLineMap().getLineNumber(startPosition);
      violations.add(new Violation(Path.of(unit.getSourceFile().toUri()), line, message));
    }

    private void reportMissingRecordComponentTags(
        ClassTree classTree, List<String> expectedComponentNames) {
      if (!isEffectivelyPublic(classTree.getModifiers(), getCurrentPath())) {
        return;
      }

      DocCommentTree recordDoc = docTrees.getDocCommentTree(getCurrentPath());
      if (recordDoc == null || expectedComponentNames.isEmpty()) {
        return;
      }

      Set<String> documentedParams = extractJavadocParamNames(recordDoc);
      List<String> missingParams =
          expectedComponentNames.stream()
              .filter(componentName -> !documentedParams.contains(componentName))
              .toList();
      if (missingParams.isEmpty()) {
        return;
      }

      reportViolation(
          classTree,
          "Record '"
              + classTree.getSimpleName()
              + "' is missing @param tags for: "
              + String.join(", ", missingParams));
    }

    private boolean isCanonicalRecordConstructor(
        MethodTree methodTree, RecordContext currentRecord) {
      List<String> constructorParameterNames =
          methodTree.getParameters().stream().map(param -> param.getName().toString()).toList();
      return currentRecord != null
          && methodTree.getName().contentEquals("<init>")
          && methodTree.getReturnType() == null
          && constructorParameterNames.equals(currentRecord.componentNames());
    }

    private boolean requiresReturnTag(MethodTree methodTree) {
      return methodTree.getReturnType() != null
          && !"void".equals(methodTree.getReturnType().toString());
    }

    private List<String> resolveRecordComponentNames(ClassTree classTree) {
      DocCommentTree recordDoc = docTrees.getDocCommentTree(getCurrentPath());
      Set<String> javadocParamNames = extractJavadocParamNames(recordDoc);
      if (!javadocParamNames.isEmpty()) {
        return List.copyOf(javadocParamNames);
      }

      List<String> componentNames = new ArrayList<>();
      for (Tree member : classTree.getMembers()) {
        if (member.getKind() != Tree.Kind.VARIABLE) {
          break;
        }
        VariableTree variableTree = (VariableTree) member;
        if (variableTree.getModifiers().getFlags().contains(Modifier.STATIC)) {
          continue;
        }
        componentNames.add(variableTree.getName().toString());
      }
      return componentNames;
    }

    private Set<String> extractJavadocParamNames(DocCommentTree docCommentTree) {
      if (docCommentTree == null) {
        return Set.of();
      }

      return docCommentTree.getBlockTags().stream()
          .filter(ParamTree.class::isInstance)
          .map(ParamTree.class::cast)
          .filter(paramTree -> !paramTree.isTypeParameter())
          .map(paramTree -> paramTree.getName().getName().toString())
          .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private boolean hasReturnTag(DocCommentTree docCommentTree) {
      return docCommentTree != null
          && docCommentTree.getBlockTags().stream().anyMatch(ReturnTree.class::isInstance);
    }

    private boolean isDocumentedPublicConstant(VariableTree variableTree, TreePath currentPath) {
      return variableTree.getInitializer() != null
          && isEffectivelyPublic(variableTree.getModifiers(), currentPath)
          && variableTree.getModifiers().getFlags().contains(Modifier.STATIC)
          && variableTree.getModifiers().getFlags().contains(Modifier.FINAL)
          && currentPath.getParentPath() != null
          && currentPath.getParentPath().getLeaf() instanceof ClassTree;
    }

    private boolean isEffectivelyPublic(ModifiersTree modifiersTree, TreePath currentPath) {
      if (!hasEffectivelyPublicTypeChain(currentPath)) {
        return false;
      }

      if (modifiersTree.getFlags().contains(Modifier.PUBLIC)) {
        return true;
      }

      TreePath parentPath = currentPath.getParentPath();
      return parentPath != null
          && parentPath.getLeaf() instanceof ClassTree enclosingClass
          && (enclosingClass.getKind() == Tree.Kind.INTERFACE
              || enclosingClass.getKind() == Tree.Kind.ANNOTATION_TYPE)
          && !modifiersTree.getFlags().contains(Modifier.PRIVATE);
    }

    private boolean hasEffectivelyPublicTypeChain(TreePath currentPath) {
      TreePath cursor = currentPath.getParentPath();
      while (cursor != null) {
        if (cursor.getLeaf() instanceof ClassTree classTree
            && !isEffectivelyPublicType(classTree, cursor)) {
          return false;
        }
        cursor = cursor.getParentPath();
      }
      return true;
    }

    private boolean isEffectivelyPublicType(ClassTree classTree, TreePath classPath) {
      if (classTree.getModifiers().getFlags().contains(Modifier.PUBLIC)) {
        return true;
      }

      TreePath parentPath = classPath.getParentPath();
      return parentPath != null
          && parentPath.getLeaf() instanceof ClassTree enclosingClass
          && (enclosingClass.getKind() == Tree.Kind.INTERFACE
              || enclosingClass.getKind() == Tree.Kind.ANNOTATION_TYPE)
          && !classTree.getModifiers().getFlags().contains(Modifier.PRIVATE);
    }
  }
}
