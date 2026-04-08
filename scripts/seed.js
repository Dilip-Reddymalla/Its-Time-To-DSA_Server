/**
 * Seed Script — npm run seed
 *
 * Sources:
 * 1. Attempts to scrape Striver A2Z from takeuforward.org
 * 2. Falls back to bundled static JSON (~300 curated problems) if scraping fails
 *
 * Idempotent: uses upsert on `slug` field
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Problem = require('../src/models/Problem');
const Concept = require('../src/models/Concept');

// ─── Static Fallback Problems ────────────────────────────────────────────────
const SEED_PROBLEMS = [
  // Arrays
  { name: 'Two Sum', slug: 'two-sum', difficulty: 'Easy', topic: 'Arrays', leetcodeSlug: 'two-sum', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=KLlXCFG5TnA', dryRunResources: [{ label: 'Two Sum - GFG', url: 'https://www.geeksforgeeks.org/given-an-array-a-and-a-number-x-check-for-pair-in-a-with-sum-as-x/', type: 'article' }] },
  { name: 'Best Time to Buy and Sell Stock', slug: 'best-time-to-buy-and-sell-stock', difficulty: 'Easy', topic: 'Arrays', leetcodeSlug: 'best-time-to-buy-and-sell-stock', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=1pkOgXD63yU', dryRunResources: [{ label: 'Kadane\'s variant - GFG', url: 'https://www.geeksforgeeks.org/stock-buy-sell/', type: 'article' }] },
  { name: 'Contains Duplicate', slug: 'contains-duplicate', difficulty: 'Easy', topic: 'Arrays', leetcodeSlug: 'contains-duplicate', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=3OamzN90kqg' },
  { name: 'Maximum Subarray', slug: 'maximum-subarray', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'maximum-subarray', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=5WZl3MMT0Eg', dryRunResources: [{ label: 'Kadane\'s Algorithm - GFG', url: 'https://www.geeksforgeeks.org/largest-sum-contiguous-subarray/', type: 'article' }, { label: 'Kadane\'s Visualization', url: 'https://visualgo.net/en/sssp', type: 'visualization' }] },
  { name: 'Product of Array Except Self', slug: 'product-of-array-except-self', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'product-of-array-except-self', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=bNvIQI2wAjk', dryRunResources: [{ label: 'Prefix Product - GFG', url: 'https://www.geeksforgeeks.org/product-of-array-except-self/', type: 'article' }] },
  { name: 'Maximum Product Subarray', slug: 'maximum-product-subarray', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'maximum-product-subarray', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=hnswaLJvr6g' },
  { name: 'Find Minimum in Rotated Sorted Array', slug: 'find-minimum-in-rotated-sorted-array', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'find-minimum-in-rotated-sorted-array', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=nIVW4P8b1VA' },
  { name: 'Search in Rotated Sorted Array', slug: 'search-in-rotated-sorted-array', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'search-in-rotated-sorted-array', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=U8XENwh8Oy8' },
  { name: 'Container With Most Water', slug: 'container-with-most-water', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'container-with-most-water', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=UuiTKBwPgAo' },
  { name: 'Trapping Rain Water', slug: 'trapping-rain-water', difficulty: 'Hard', topic: 'Arrays', leetcodeSlug: 'trapping-rain-water', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=ZI2z5pq0TqA', dryRunResources: [{ label: 'Trapping Rainwater - GFG', url: 'https://www.geeksforgeeks.org/trapping-rain-water/', type: 'article' }] },
  { name: 'Move Zeroes', slug: 'move-zeroes', difficulty: 'Easy', topic: 'Arrays', leetcodeSlug: 'move-zeroes', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=wqVjg8PgYCo' },
  { name: 'Sort Colors', slug: 'sort-colors', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'sort-colors', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=tp8JIuCXBaU', dryRunResources: [{ label: 'Dutch National Flag - GFG', url: 'https://www.geeksforgeeks.org/sort-an-array-of-0s-1s-and-2s/', type: 'article' }] },
  { name: 'Next Permutation', slug: 'next-permutation', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'next-permutation', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=JDOXKqF60RQ' },
  { name: 'Spiral Matrix', slug: 'spiral-matrix', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'spiral-matrix', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=BJnMZNwUk1M' },
  { name: 'Set Matrix Zeroes', slug: 'set-matrix-zeroes', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'set-matrix-zeroes', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=T41rL0L3Pnw' },

  // Strings
  { name: 'Valid Anagram', slug: 'valid-anagram', difficulty: 'Easy', topic: 'Strings', leetcodeSlug: 'valid-anagram', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=9UtInBqnCgA' },
  { name: 'Valid Palindrome', slug: 'valid-palindrome', difficulty: 'Easy', topic: 'Strings', leetcodeSlug: 'valid-palindrome', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=jJXJ16kPFWg' },
  { name: 'Longest Substring Without Repeating Characters', slug: 'longest-substring-without-repeating-characters', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'longest-substring-without-repeating-characters', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=wiGpQwVHdE0', dryRunResources: [{ label: 'Sliding Window - GFG', url: 'https://www.geeksforgeeks.org/length-of-the-longest-substring-without-repeating-characters/', type: 'article' }] },
  { name: 'Longest Repeating Character Replacement', slug: 'longest-repeating-character-replacement', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'longest-repeating-character-replacement', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=gqXU1UyA8pk' },
  { name: 'Minimum Window Substring', slug: 'minimum-window-substring', difficulty: 'Hard', topic: 'Strings', leetcodeSlug: 'minimum-window-substring', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=jSto0O4AJbM' },
  { name: 'Group Anagrams', slug: 'group-anagrams', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'group-anagrams', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=vzdNOK2oB2E' },
  { name: 'Encode and Decode Strings', slug: 'encode-and-decode-strings', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'encode-and-decode-strings', source: 'neetcode' },
  { name: 'Palindromic Substrings', slug: 'palindromic-substrings', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'palindromic-substrings', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=4RACzI5-du8' },
  { name: 'Longest Palindromic Substring', slug: 'longest-palindromic-substring', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'longest-palindromic-substring', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=XYQecbcd6_c' },

  // Basic Math
  { name: 'Palindrome Number', slug: 'palindrome-number', difficulty: 'Easy', topic: 'Basic Math', leetcodeSlug: 'palindrome-number', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=1xNbjMdbjug' },
  { name: 'Reverse Integer', slug: 'reverse-integer', difficulty: 'Medium', topic: 'Basic Math', leetcodeSlug: 'reverse-integer', source: 'striver-a2z' },
  { name: 'GCD of Two Numbers', slug: 'gcd-of-two-numbers', difficulty: 'Easy', topic: 'Basic Math', leetcodeSlug: 'find-greatest-common-divisor-of-array', source: 'striver-a2z', dryRunResources: [{ label: 'Euclid GCD - GFG', url: 'https://www.geeksforgeeks.org/euclidean-algorithms-basic-and-extended/', type: 'article' }] },
  { name: 'Count Digits', slug: 'count-digits', difficulty: 'Easy', topic: 'Basic Math', leetcodeSlug: 'count-digits', source: 'striver-a2z' },
  { name: 'Armstrong Numbers', slug: 'armstrong-numbers', difficulty: 'Easy', topic: 'Basic Math', leetcodeSlug: 'armstrong-number', source: 'striver-a2z' },

  // Hashing
  { name: 'Two Sum II', slug: 'two-sum-ii', difficulty: 'Medium', topic: 'Hashing', leetcodeSlug: 'two-sum-ii-input-array-is-sorted', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=cQ1Oz4ckceM' },
  { name: 'Longest Consecutive Sequence', slug: 'longest-consecutive-sequence', difficulty: 'Medium', topic: 'Hashing', leetcodeSlug: 'longest-consecutive-sequence', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=P6RZZMu_maU', dryRunResources: [{ label: 'Longest Consecutive - GFG', url: 'https://www.geeksforgeeks.org/longest-consecutive-subsequence/', type: 'article' }] },
  { name: 'Top K Frequent Elements', slug: 'top-k-frequent-elements', difficulty: 'Medium', topic: 'Hashing', leetcodeSlug: 'top-k-frequent-elements', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=YPTqKIgVk-k' },
  { name: 'Subarray Sum Equals K', slug: 'subarray-sum-equals-k', difficulty: 'Medium', topic: 'Hashing', leetcodeSlug: 'subarray-sum-equals-k', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=fFVZt-6sgyo', dryRunResources: [{ label: 'Prefix Sum + HashMap - GFG', url: 'https://www.geeksforgeeks.org/number-subarrays-sum-exactly-equal-k/', type: 'article' }] },

  // Two Pointers
  { name: 'Valid Palindrome II', slug: 'valid-palindrome-ii', difficulty: 'Easy', topic: 'Two Pointers', leetcodeSlug: 'valid-palindrome-ii', source: 'neetcode' },
  { name: '3Sum', slug: '3sum', difficulty: 'Medium', topic: 'Two Pointers', leetcodeSlug: '3sum', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=jzZsG8n2R9A', dryRunResources: [{ label: '3Sum - GFG', url: 'https://www.geeksforgeeks.org/find-a-triplet-that-sum-to-a-given-value/', type: 'article' }] },
  { name: '4Sum', slug: '4sum', difficulty: 'Medium', topic: 'Two Pointers', leetcodeSlug: '4sum', source: 'striver-a2z' },
  { name: 'Remove Duplicates from Sorted Array', slug: 'remove-duplicates', difficulty: 'Easy', topic: 'Two Pointers', leetcodeSlug: 'remove-duplicates-from-sorted-array', source: 'striver-a2z' },
  { name: 'Boats to Save People', slug: 'boats-to-save-people', difficulty: 'Medium', topic: 'Two Pointers', leetcodeSlug: 'boats-to-save-people', source: 'neetcode' },

  // Sliding Window
  { name: 'Maximum Sum Subarray of Size K', slug: 'maximum-sum-subarray-size-k', difficulty: 'Easy', topic: 'Sliding Window', leetcodeSlug: 'maximum-average-subarray-i', source: 'striver-a2z', dryRunResources: [{ label: 'Sliding Window - GFG', url: 'https://www.geeksforgeeks.org/window-sliding-technique/', type: 'article' }] },
  { name: 'Longest Subarray with Sum K', slug: 'longest-subarray-sum-k', difficulty: 'Medium', topic: 'Sliding Window', leetcodeSlug: 'maximum-size-subarray-sum-equals-k', source: 'striver-a2z' },
  { name: 'Fruits Into Baskets', slug: 'fruit-into-baskets', difficulty: 'Medium', topic: 'Sliding Window', leetcodeSlug: 'fruit-into-baskets', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=e3bs0uA1NhQ' },
  { name: 'Number of Substrings Containing All Three Characters', slug: 'number-substrings-all-three', difficulty: 'Medium', topic: 'Sliding Window', leetcodeSlug: 'number-of-substrings-containing-all-three-characters', source: 'striver-a2z' },

  // Recursion
  { name: 'Fibonacci Number', slug: 'fibonacci-number', difficulty: 'Easy', topic: 'Recursion', leetcodeSlug: 'fibonacci-number', source: 'striver-a2z', dryRunResources: [{ label: 'Recursion Intro - GFG', url: 'https://www.geeksforgeeks.org/introduction-to-recursion-data-structure-and-algorithm-tutorials/', type: 'article' }, { label: 'Recursion Visualizer', url: 'https://recursion.vercel.app/', type: 'visualization' }] },
  { name: 'Power of Two', slug: 'power-of-two', difficulty: 'Easy', topic: 'Recursion', leetcodeSlug: 'power-of-two', source: 'striver-a2z' },
  { name: 'Reverse a String using Recursion', slug: 'reverse-string-recursion', difficulty: 'Easy', topic: 'Recursion', leetcodeSlug: 'reverse-string', source: 'striver-a2z' },
  { name: 'Pow(x, n)', slug: 'powx-n', difficulty: 'Medium', topic: 'Recursion', leetcodeSlug: 'powx-n', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=hFWckDXE-K8' },

  // Backtracking
  { name: 'Subsets', slug: 'subsets', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'subsets', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=REOH22Xwdkk', dryRunResources: [{ label: 'Power Set - GFG', url: 'https://www.geeksforgeeks.org/power-set/', type: 'article' }, { label: 'Subset Visualizer', url: 'https://www.cs.usfca.edu/~galles/visualization/RecFact.html', type: 'visualization' }] },
  { name: 'Subsets II', slug: 'subsets-ii', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'subsets-ii', source: 'neetcode' },
  { name: 'Permutations', slug: 'permutations', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'permutations', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=s7AvT7cGdSo' },
  { name: 'Combination Sum', slug: 'combination-sum', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'combination-sum', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=GBKI9VSKdGg' },
  { name: 'Combination Sum II', slug: 'combination-sum-ii', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'combination-sum-ii', source: 'neetcode' },
  { name: 'N-Queens', slug: 'n-queens', difficulty: 'Hard', topic: 'Backtracking', leetcodeSlug: 'n-queens', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=i05Ju7AR6ok' },
  { name: 'Sudoku Solver', slug: 'sudoku-solver', difficulty: 'Hard', topic: 'Backtracking', leetcodeSlug: 'sudoku-solver', source: 'striver-a2z' },
  { name: 'Word Search', slug: 'word-search', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'word-search', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=pfiQ_PS1g8E' },

  // Binary Search
  { name: 'Binary Search', slug: 'binary-search', difficulty: 'Easy', topic: 'Binary Search', leetcodeSlug: 'binary-search', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=s4DPM8ct1pI', dryRunResources: [{ label: 'Binary Search - GFG', url: 'https://www.geeksforgeeks.org/binary-search/', type: 'article' }, { label: 'BS Visualizer', url: 'https://visualgo.net/en/bst', type: 'visualization' }] },
  { name: 'Find First and Last Position', slug: 'find-first-and-last-position', difficulty: 'Medium', topic: 'Binary Search', leetcodeSlug: 'find-first-and-last-position-of-element-in-sorted-array', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=bU_YDP5aKZw' },
  { name: 'Search a 2D Matrix', slug: 'search-a-2d-matrix', difficulty: 'Medium', topic: 'Binary Search', leetcodeSlug: 'search-a-2d-matrix', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=Ber2pi2C0j0' },
  { name: 'Koko Eating Bananas', slug: 'koko-eating-bananas', difficulty: 'Medium', topic: 'Binary Search', leetcodeSlug: 'koko-eating-bananas', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=U2SozAs9RzA' },
  { name: 'Median of Two Sorted Arrays', slug: 'median-of-two-sorted-arrays', difficulty: 'Hard', topic: 'Binary Search', leetcodeSlug: 'median-of-two-sorted-arrays', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=q6IEA26hvXc' },
  { name: 'Aggressive Cows', slug: 'aggressive-cows', difficulty: 'Medium', topic: 'Binary Search', leetcodeSlug: 'aggressive-cows', source: 'striver-a2z', dryRunResources: [{ label: 'Binary Search on Answer - GFG', url: 'https://www.geeksforgeeks.org/arrange-given-numbers-to-form-the-biggest-number/', type: 'article' }] },

  // Graphs
  { name: 'Number of Islands', slug: 'number-of-islands', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'number-of-islands', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=pV2kpPD66nE', dryRunResources: [{ label: 'BFS/DFS - GFG', url: 'https://www.geeksforgeeks.org/breadth-first-search-or-bfs-for-a-graph/', type: 'article' }, { label: 'Graph Visualizer', url: 'https://visualgo.net/en/dfsbfs', type: 'visualization' }] },
  { name: 'Clone Graph', slug: 'clone-graph', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'clone-graph', source: 'neetcode' },
  { name: 'Pacific Atlantic Water Flow', slug: 'pacific-atlantic-water-flow', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'pacific-atlantic-water-flow', source: 'neetcode' },
  { name: 'Course Schedule', slug: 'course-schedule', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'course-schedule', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=EgI5nU9etnU', dryRunResources: [{ label: 'Topological Sort - GFG', url: 'https://www.geeksforgeeks.org/topological-sorting/', type: 'article' }] },
  { name: 'Course Schedule II', slug: 'course-schedule-ii', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'course-schedule-ii', source: 'neetcode' },
  { name: 'Rotting Oranges', slug: 'rotting-oranges', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'rotting-oranges', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=yf3oUhkvqA0' },
  { name: 'Surrounded Regions', slug: 'surrounded-regions', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'surrounded-regions', source: 'neetcode' },
  { name: 'Word Ladder', slug: 'word-ladder', difficulty: 'Hard', topic: 'Graphs', leetcodeSlug: 'word-ladder', source: 'striver-a2z' },

  // Trees
  { name: 'Invert Binary Tree', slug: 'invert-binary-tree', difficulty: 'Easy', topic: 'Trees', leetcodeSlug: 'invert-binary-tree', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=OnSn2XEQ4MY', dryRunResources: [{ label: 'Binary Trees - GFG', url: 'https://www.geeksforgeeks.org/binary-tree-data-structure/', type: 'article' }] },
  { name: 'Maximum Depth of Binary Tree', slug: 'maximum-depth-of-binary-tree', difficulty: 'Easy', topic: 'Trees', leetcodeSlug: 'maximum-depth-of-binary-tree', source: 'neetcode' },
  { name: 'Diameter of Binary Tree', slug: 'diameter-of-binary-tree', difficulty: 'Easy', topic: 'Trees', leetcodeSlug: 'diameter-of-binary-tree', source: 'neetcode' },
  { name: 'Balanced Binary Tree', slug: 'balanced-binary-tree', difficulty: 'Easy', topic: 'Trees', leetcodeSlug: 'balanced-binary-tree', source: 'neetcode' },
  { name: 'Lowest Common Ancestor of BST', slug: 'lowest-common-ancestor-of-bst', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'lowest-common-ancestor-of-a-binary-search-tree', source: 'neetcode' },
  { name: 'Binary Tree Level Order Traversal', slug: 'binary-tree-level-order-traversal', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'binary-tree-level-order-traversal', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=6ZnyEApgFYg' },
  { name: 'Validate Binary Search Tree', slug: 'validate-binary-search-tree', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'validate-binary-search-tree', source: 'neetcode' },
  { name: 'Serialize and Deserialize Binary Tree', slug: 'serialize-and-deserialize-binary-tree', difficulty: 'Hard', topic: 'Trees', leetcodeSlug: 'serialize-and-deserialize-binary-tree', source: 'neetcode' },
  { name: 'Binary Tree Maximum Path Sum', slug: 'binary-tree-maximum-path-sum', difficulty: 'Hard', topic: 'Trees', leetcodeSlug: 'binary-tree-maximum-path-sum', source: 'neetcode' },

  // Heaps
  { name: 'Kth Largest Element in Array', slug: 'kth-largest-element-in-array', difficulty: 'Medium', topic: 'Heaps', leetcodeSlug: 'kth-largest-element-in-an-array', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=XEmy13g1Qxc', dryRunResources: [{ label: 'Heap - GFG', url: 'https://www.geeksforgeeks.org/heap-data-structure/', type: 'article' }, { label: 'Heap Visualizer', url: 'https://visualgo.net/en/heap', type: 'visualization' }] },
  { name: 'Find Median from Data Stream', slug: 'find-median-from-data-stream', difficulty: 'Hard', topic: 'Heaps', leetcodeSlug: 'find-median-from-data-stream', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=itmhHWaHupI' },
  { name: 'Task Scheduler', slug: 'task-scheduler', difficulty: 'Medium', topic: 'Heaps', leetcodeSlug: 'task-scheduler', source: 'neetcode' },
  { name: 'Design Twitter', slug: 'design-twitter', difficulty: 'Medium', topic: 'Heaps', leetcodeSlug: 'design-twitter', source: 'neetcode' },
  { name: 'K Closest Points to Origin', slug: 'k-closest-points-to-origin', difficulty: 'Medium', topic: 'Heaps', leetcodeSlug: 'k-closest-points-to-origin', source: 'neetcode' },

  // Dynamic Programming
  { name: 'Climbing Stairs', slug: 'climbing-stairs', difficulty: 'Easy', topic: 'Dynamic Programming', leetcodeSlug: 'climbing-stairs', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=Y0lT9Fck7qI', dryRunResources: [{ label: 'DP Intro - GFG', url: 'https://www.geeksforgeeks.org/dynamic-programming/', type: 'article' }, { label: 'Striver DP Series', url: 'https://www.youtube.com/playlist?list=PLgUwDviBIf0qUlt5H_kiKYaNSqJ81PMMY', type: 'video' }] },
  { name: 'House Robber', slug: 'house-robber', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'house-robber', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=73r3KWiEvyk' },
  { name: 'House Robber II', slug: 'house-robber-ii', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'house-robber-ii', source: 'neetcode' },
  { name: 'Longest Palindromic Subsequence', slug: 'longest-palindromic-subsequence', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'longest-palindromic-subsequence', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=bUr8cNWI09Q' },
  { name: 'Coin Change', slug: 'coin-change', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'coin-change', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=H9bfqozjoqs', dryRunResources: [{ label: 'Knapsack Variant - GFG', url: 'https://www.geeksforgeeks.org/coin-change-dp-7/', type: 'article' }] },
  { name: 'Longest Increasing Subsequence', slug: 'longest-increasing-subsequence', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'longest-increasing-subsequence', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=on2hvxBXJH4' },
  { name: '0/1 Knapsack', slug: '0-1-knapsack', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'ones-and-zeroes', source: 'striver-a2z', dryRunResources: [{ label: '0/1 Knapsack - GFG', url: 'https://www.geeksforgeeks.org/0-1-knapsack-problem-dp-10/', type: 'article' }] },
  { name: 'Unique Paths', slug: 'unique-paths', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'unique-paths', source: 'neetcode' },
  { name: 'Edit Distance', slug: 'edit-distance', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'edit-distance', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=fp4tVeCbKUo' },
  { name: 'Burst Balloons', slug: 'burst-balloons', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'burst-balloons', source: 'neetcode' },

  // Advanced Graphs
  { name: "Dijkstra's Algorithm", slug: 'dijkstras-algorithm', difficulty: 'Medium', topic: 'Advanced Graphs', leetcodeSlug: 'network-delay-time', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=V6H1qAeB-l4', dryRunResources: [{ label: "Dijkstra's - GFG", url: 'https://www.geeksforgeeks.org/dijkstras-shortest-path-algorithm-greedy-algo-7/', type: 'article' }] },
  { name: 'Cheapest Flights Within K Stops', slug: 'cheapest-flights-within-k-stops', difficulty: 'Medium', topic: 'Advanced Graphs', leetcodeSlug: 'cheapest-flights-within-k-stops', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=5eIK3zUdYmE' },
  { name: 'Minimum Spanning Tree (Prim)', slug: 'minimum-spanning-tree-prim', difficulty: 'Medium', topic: 'Advanced Graphs', leetcodeSlug: 'min-cost-to-connect-all-points', source: 'striver-a2z', dryRunResources: [{ label: "Prim's Algorithm - GFG", url: 'https://www.geeksforgeeks.org/prims-minimum-spanning-tree-mst-greedy-algo-5/', type: 'article' }] },
  { name: 'Floyd Warshall', slug: 'floyd-warshall', difficulty: 'Medium', topic: 'Advanced Graphs', leetcodeSlug: 'find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance', source: 'striver-a2z' },
  { name: 'Alien Dictionary', slug: 'alien-dictionary', difficulty: 'Hard', topic: 'Advanced Graphs', leetcodeSlug: 'alien-dictionary', source: 'striver-a2z' },

  // ── Arrays (extended) ──────────────────────────────────────────────────────
  { name: 'Majority Element', slug: 'majority-element', difficulty: 'Easy', topic: 'Arrays', leetcodeSlug: 'majority-element', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=nP_ns3uSh80', dryRunResources: [{ label: "Boyer-Moore Voting - GFG", url: 'https://www.geeksforgeeks.org/boyer-moore-majority-voting-algorithm/', type: 'article' }] },
  { name: 'Majority Element II', slug: 'majority-element-ii', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'majority-element-ii', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=yDbkQd9t2ig' },
  { name: 'Kadane Algorithm Variant (Max Circular)', slug: 'maximum-sum-circular-subarray', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'maximum-sum-circular-subarray', source: 'striver-a2z' },
  { name: 'Merge Intervals', slug: 'merge-intervals', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'merge-intervals', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=44H3cEC2fFM', dryRunResources: [{ label: 'Merge Intervals - GFG', url: 'https://www.geeksforgeeks.org/merging-intervals/', type: 'article' }] },
  { name: 'Insert Interval', slug: 'insert-interval', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'insert-interval', source: 'neetcode' },
  { name: 'Meeting Rooms II', slug: 'meeting-rooms-ii', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'meeting-rooms-ii', source: 'neetcode', dryRunResources: [{ label: 'Meeting Rooms - GFG', url: 'https://www.geeksforgeeks.org/find-minimum-platforms-required-for-a-railway/', type: 'article' }] },
  { name: 'Rotate Array', slug: 'rotate-array', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'rotate-array', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=wvcQg43_V8U' },
  { name: 'Rotate Image', slug: 'rotate-image', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'rotate-image', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=Z0R2u6gd3GU' },
  { name: 'Pascal Triangle', slug: 'pascals-triangle', difficulty: 'Easy', topic: 'Arrays', leetcodeSlug: 'pascals-triangle', source: 'striver-a2z', dryRunResources: [{ label: "Pascal's Triangle - GFG", url: 'https://www.geeksforgeeks.org/pascal-triangle/', type: 'article' }] },
  { name: 'Stock Buy Sell Multiple Transactions', slug: 'best-time-to-buy-and-sell-stock-ii', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'best-time-to-buy-and-sell-stock-ii', source: 'striver-a2z' },
  { name: 'Jump Game', slug: 'jump-game', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'jump-game', source: 'neetcode' },
  { name: 'Jump Game II', slug: 'jump-game-ii', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'jump-game-ii', source: 'neetcode' },
  { name: 'Candy', slug: 'candy', difficulty: 'Hard', topic: 'Arrays', leetcodeSlug: 'candy', source: 'striver-a2z', dryRunResources: [{ label: 'Greedy Candy - GFG', url: 'https://www.geeksforgeeks.org/minimum-number-of-candies-required-such-that-no-two-adjacent-students-have-the-same-number-of-candies/', type: 'article' }] },
  { name: 'Find the Duplicate Number', slug: 'find-the-duplicate-number', difficulty: 'Medium', topic: 'Arrays', leetcodeSlug: 'find-the-duplicate-number', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=wjYnzkAhcNk' },
  { name: 'First Missing Positive', slug: 'first-missing-positive', difficulty: 'Hard', topic: 'Arrays', leetcodeSlug: 'first-missing-positive', source: 'neetcode' },
  { name: 'Count Inversions', slug: 'count-inversions', difficulty: 'Hard', topic: 'Arrays', leetcodeSlug: 'sort-an-array', source: 'striver-a2z', dryRunResources: [{ label: 'Count Inversions Merge Sort - GFG', url: 'https://www.geeksforgeeks.org/counting-inversions/', type: 'article' }] },

  // ── Strings (extended) ─────────────────────────────────────────────────────
  { name: 'Reverse Words in a String', slug: 'reverse-words-in-a-string', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'reverse-words-in-a-string', source: 'striver-a2z' },
  { name: 'String to Integer (atoi)', slug: 'string-to-integer-atoi', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'string-to-integer-atoi', source: 'striver-a2z' },
  { name: 'Count and Say', slug: 'count-and-say', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'count-and-say', source: 'striver-a2z' },
  { name: 'Roman to Integer', slug: 'roman-to-integer', difficulty: 'Easy', topic: 'Strings', leetcodeSlug: 'roman-to-integer', source: 'striver-a2z' },
  { name: 'Integer to Roman', slug: 'integer-to-roman', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'integer-to-roman', source: 'striver-a2z' },
  { name: 'Longest Common Prefix', slug: 'longest-common-prefix', difficulty: 'Easy', topic: 'Strings', leetcodeSlug: 'longest-common-prefix', source: 'striver-a2z' },
  { name: 'Implement strStr', slug: 'implement-strstr', difficulty: 'Easy', topic: 'Strings', leetcodeSlug: 'find-the-index-of-the-first-occurrence-in-a-string', source: 'striver-a2z', dryRunResources: [{ label: 'KMP Algorithm - GFG', url: 'https://www.geeksforgeeks.org/kmp-algorithm-for-pattern-searching/', type: 'article' }] },
  { name: 'Rabin-Karp String Search', slug: 'rabin-karp', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'implement-strstr', source: 'striver-a2z', dryRunResources: [{ label: 'Rabin-Karp - GFG', url: 'https://www.geeksforgeeks.org/rabin-karp-algorithm-for-pattern-searching/', type: 'article' }] },
  { name: 'Largest Number', slug: 'largest-number', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'largest-number', source: 'striver-a2z' },
  { name: 'Isomorphic Strings', slug: 'isomorphic-strings', difficulty: 'Easy', topic: 'Strings', leetcodeSlug: 'isomorphic-strings', source: 'striver-a2z' },
  { name: 'Sentence Similarity', slug: 'sentence-similarity', difficulty: 'Easy', topic: 'Strings', leetcodeSlug: 'sentence-similarity', source: 'custom' },
  { name: 'Number of Distinct Substrings', slug: 'number-of-distinct-substrings', difficulty: 'Medium', topic: 'Strings', leetcodeSlug: 'number-of-distinct-substrings-in-a-string', source: 'striver-a2z' },

  // ── Hashing (extended) ─────────────────────────────────────────────────────
  { name: 'Count Zero Sum Subarrays', slug: 'count-zero-sum-subarrays', difficulty: 'Medium', topic: 'Hashing', leetcodeSlug: 'subarray-sum-equals-k', source: 'striver-a2z', dryRunResources: [{ label: 'Zero Sum - GFG', url: 'https://www.geeksforgeeks.org/find-if-there-is-a-subarray-with-0-sum/', type: 'article' }] },
  { name: 'Pairs with Given Sum', slug: 'pairs-with-given-sum', difficulty: 'Easy', topic: 'Hashing', leetcodeSlug: 'two-sum', source: 'striver-a2z', dryRunResources: [{ label: 'Pairs - GFG', url: 'https://www.geeksforgeeks.org/count-pairs-with-given-sum/', type: 'article' }] },
  { name: 'Count Distinct Elements in Every Window', slug: 'count-distinct-window', difficulty: 'Medium', topic: 'Hashing', leetcodeSlug: 'sliding-window-maximum', source: 'striver-a2z' },
  { name: 'Check if Array is Subset', slug: 'array-subset', difficulty: 'Easy', topic: 'Hashing', leetcodeSlug: 'check-if-array-is-subset-of-another-array', source: 'striver-a2z', dryRunResources: [{ label: 'Subset Check - GFG', url: 'https://www.geeksforgeeks.org/find-whether-an-array-is-subset-of-another-array/', type: 'article' }] },
  { name: '4Sum II', slug: '4sum-ii', difficulty: 'Medium', topic: 'Hashing', leetcodeSlug: '4sum-ii', source: 'neetcode' },
  { name: 'Ransom Note', slug: 'ransom-note', difficulty: 'Easy', topic: 'Hashing', leetcodeSlug: 'ransom-note', source: 'neetcode' },
  { name: 'Word Pattern', slug: 'word-pattern', difficulty: 'Easy', topic: 'Hashing', leetcodeSlug: 'word-pattern', source: 'neetcode' },

  // ── Two Pointers (extended) ────────────────────────────────────────────────
  { name: 'Merge Sorted Array', slug: 'merge-sorted-array', difficulty: 'Easy', topic: 'Two Pointers', leetcodeSlug: 'merge-sorted-array', source: 'striver-a2z' },
  { name: 'Intersection of Two Arrays II', slug: 'intersection-two-arrays-ii', difficulty: 'Easy', topic: 'Two Pointers', leetcodeSlug: 'intersection-of-two-arrays-ii', source: 'striver-a2z' },
  { name: 'Squares of Sorted Array', slug: 'squares-of-sorted-array', difficulty: 'Easy', topic: 'Two Pointers', leetcodeSlug: 'squares-of-a-sorted-array', source: 'neetcode' },
  { name: 'Minimum Size Subarray Sum', slug: 'minimum-size-subarray-sum', difficulty: 'Medium', topic: 'Two Pointers', leetcodeSlug: 'minimum-size-subarray-sum', source: 'neetcode' },
  { name: 'Backspace String Compare', slug: 'backspace-string-compare', difficulty: 'Easy', topic: 'Two Pointers', leetcodeSlug: 'backspace-string-compare', source: 'neetcode' },
  { name: 'Linked List Cycle', slug: 'linked-list-cycle', difficulty: 'Easy', topic: 'Two Pointers', leetcodeSlug: 'linked-list-cycle', source: 'neetcode', dryRunResources: [{ label: "Floyd Cycle - GFG", url: 'https://www.geeksforgeeks.org/detect-loop-in-a-linked-list/', type: 'article' }] },
  { name: 'Remove Nth Node from End', slug: 'remove-nth-node', difficulty: 'Medium', topic: 'Two Pointers', leetcodeSlug: 'remove-nth-node-from-end-of-list', source: 'neetcode' },

  // ── Sliding Window (extended) ──────────────────────────────────────────────
  { name: 'Permutation in String', slug: 'permutation-in-string', difficulty: 'Medium', topic: 'Sliding Window', leetcodeSlug: 'permutation-in-string', source: 'neetcode' },
  { name: 'Find All Anagrams in a String', slug: 'find-all-anagrams', difficulty: 'Medium', topic: 'Sliding Window', leetcodeSlug: 'find-all-anagrams-in-a-string', source: 'neetcode', dryRunResources: [{ label: 'Anagram Sliding Window - GFG', url: 'https://www.geeksforgeeks.org/find-all-anagrams-in-a-string/', type: 'article' }] },
  { name: 'Max Consecutive Ones III', slug: 'max-consecutive-ones-iii', difficulty: 'Medium', topic: 'Sliding Window', leetcodeSlug: 'max-consecutive-ones-iii', source: 'neetcode' },
  { name: 'Subarrays with K Different Integers', slug: 'subarrays-k-different-integers', difficulty: 'Hard', topic: 'Sliding Window', leetcodeSlug: 'subarrays-with-k-different-integers', source: 'neetcode' },
  { name: 'Sliding Window Maximum', slug: 'sliding-window-maximum', difficulty: 'Hard', topic: 'Sliding Window', leetcodeSlug: 'sliding-window-maximum', source: 'striver-a2z', dryRunResources: [{ label: 'Deque Approach - GFG', url: 'https://www.geeksforgeeks.org/sliding-window-maximum-maximum-of-all-subarrays-of-size-k/', type: 'article' }] },

  // ── Recursion (extended) ───────────────────────────────────────────────────
  { name: 'Generate Parentheses', slug: 'generate-parentheses', difficulty: 'Medium', topic: 'Recursion', leetcodeSlug: 'generate-parentheses', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=s9fokUqJ76A' },
  { name: 'Letter Combinations of a Phone Number', slug: 'letter-combinations-phone', difficulty: 'Medium', topic: 'Recursion', leetcodeSlug: 'letter-combinations-of-a-phone-number', source: 'neetcode' },
  { name: 'Flood Fill', slug: 'flood-fill', difficulty: 'Easy', topic: 'Recursion', leetcodeSlug: 'flood-fill', source: 'striver-a2z', dryRunResources: [{ label: 'Flood Fill - GFG', url: 'https://www.geeksforgeeks.org/flood-fill-algorithm/', type: 'article' }] },
  { name: 'Tower of Hanoi', slug: 'tower-of-hanoi', difficulty: 'Medium', topic: 'Recursion', leetcodeSlug: 'the-tower-of-hanoi', source: 'striver-a2z', dryRunResources: [{ label: 'Tower of Hanoi - GFG', url: 'https://www.geeksforgeeks.org/c-program-for-tower-of-hanoi/', type: 'article' }, { label: 'Tower Visualizer', url: 'https://www.mathsisfun.com/games/towerofhanoi.html', type: 'visualization' }] },
  { name: 'Sort a Stack using Recursion', slug: 'sort-stack-recursion', difficulty: 'Medium', topic: 'Recursion', leetcodeSlug: 'sort-an-array', source: 'striver-a2z' },
  { name: 'Check if String is Palindrome (Recursive)', slug: 'palindrome-recursive', difficulty: 'Easy', topic: 'Recursion', leetcodeSlug: 'valid-palindrome', source: 'striver-a2z' },

  // ── Backtracking (extended) ────────────────────────────────────────────────
  { name: 'Palindrome Partitioning', slug: 'palindrome-partitioning', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'palindrome-partitioning', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=WBgsABoClE0' },
  { name: 'Rat in a Maze', slug: 'rat-in-a-maze', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'unique-paths-iii', source: 'striver-a2z', dryRunResources: [{ label: 'Rat in Maze - GFG', url: 'https://www.geeksforgeeks.org/rat-in-a-maze-backtracking-2/', type: 'article' }] },
  { name: 'M-Coloring Problem', slug: 'm-coloring-problem', difficulty: 'Medium', topic: 'Backtracking', leetcodeSlug: 'possible-bipartition', source: 'striver-a2z', dryRunResources: [{ label: 'Graph Coloring - GFG', url: 'https://www.geeksforgeeks.org/graph-coloring-applications/', type: 'article' }] },
  { name: 'Word Break II', slug: 'word-break-ii', difficulty: 'Hard', topic: 'Backtracking', leetcodeSlug: 'word-break-ii', source: 'neetcode' },
  { name: 'Expression Add Operators', slug: 'expression-add-operators', difficulty: 'Hard', topic: 'Backtracking', leetcodeSlug: 'expression-add-operators', source: 'neetcode' },

  // ── Binary Search (extended) ───────────────────────────────────────────────
  { name: 'Floor and Ceil in Sorted Array', slug: 'floor-ceil-sorted-array', difficulty: 'Easy', topic: 'Binary Search', leetcodeSlug: 'search-insert-position', source: 'striver-a2z', dryRunResources: [{ label: 'Binary Search Variants - GFG', url: 'https://www.geeksforgeeks.org/ceiling-in-a-sorted-array/', type: 'article' }] },
  { name: 'Find Peak Element', slug: 'find-peak-element', difficulty: 'Medium', topic: 'Binary Search', leetcodeSlug: 'find-peak-element', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=cXxmbemS6XM' },
  { name: 'Single Element in Sorted Array', slug: 'single-element-sorted-array', difficulty: 'Medium', topic: 'Binary Search', leetcodeSlug: 'single-element-in-a-sorted-array', source: 'striver-a2z' },
  { name: 'Time Based Key-Value Store', slug: 'time-based-key-value-store', difficulty: 'Medium', topic: 'Binary Search', leetcodeSlug: 'time-based-key-value-store', source: 'neetcode' },
  { name: 'Find Smallest Letter Greater Than Target', slug: 'smallest-letter-greater-target', difficulty: 'Easy', topic: 'Binary Search', leetcodeSlug: 'find-smallest-letter-greater-than-target', source: 'neetcode' },
  { name: 'Square Root using Binary Search', slug: 'sqrtx', difficulty: 'Easy', topic: 'Binary Search', leetcodeSlug: 'sqrtx', source: 'striver-a2z', dryRunResources: [{ label: 'Sqrt Binary Search - GFG', url: 'https://www.geeksforgeeks.org/square-root-of-an-integer/', type: 'article' }] },
  { name: 'Painter Partition Problem', slug: 'painter-partition', difficulty: 'Hard', topic: 'Binary Search', leetcodeSlug: 'split-array-largest-sum', source: 'striver-a2z', dryRunResources: [{ label: 'Painter Partition - GFG', url: 'https://www.geeksforgeeks.org/painters-partition-problem/', type: 'article' }] },
  { name: 'Book Allocation Problem', slug: 'book-allocation', difficulty: 'Hard', topic: 'Binary Search', leetcodeSlug: 'split-array-largest-sum', source: 'striver-a2z' },

  // ── Graphs (extended) ──────────────────────────────────────────────────────
  { name: 'Detect Cycle in Directed Graph', slug: 'detect-cycle-directed', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'course-schedule', source: 'striver-a2z', dryRunResources: [{ label: 'Cycle Detection - GFG', url: 'https://www.geeksforgeeks.org/detect-cycle-in-a-graph/', type: 'article' }] },
  { name: 'Detect Cycle in Undirected Graph', slug: 'detect-cycle-undirected', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'graph-valid-tree', source: 'striver-a2z', dryRunResources: [{ label: 'Union Find - GFG', url: 'https://www.geeksforgeeks.org/disjoint-set-union-find/', type: 'article' }] },
  { name: 'Number of Provinces', slug: 'number-of-provinces', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'number-of-provinces', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=ACzkVtewUYA' },
  { name: 'Bipartite Graph Check', slug: 'is-graph-bipartite', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'is-graph-bipartite', source: 'striver-a2z', dryRunResources: [{ label: 'Bipartite - GFG', url: 'https://www.geeksforgeeks.org/bipartite-graph/', type: 'article' }] },
  { name: 'Eventual Safe States', slug: 'eventual-safe-states', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'find-eventual-safe-states', source: 'striver-a2z' },
  { name: 'Shortest Path in Binary Matrix', slug: 'shortest-path-binary-matrix', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'shortest-path-in-binary-matrix', source: 'neetcode' },
  { name: 'Number of Enclaves', slug: 'number-of-enclaves', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'number-of-enclaves', source: 'striver-a2z' },
  { name: 'Snakes and Ladders', slug: 'snakes-and-ladders', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'snakes-and-ladders', source: 'neetcode' },
  { name: 'Walls and Gates', slug: 'walls-and-gates', difficulty: 'Medium', topic: 'Graphs', leetcodeSlug: 'walls-and-gates', source: 'neetcode' },

  // ── Trees (extended) ───────────────────────────────────────────────────────
  { name: 'Same Tree', slug: 'same-tree', difficulty: 'Easy', topic: 'Trees', leetcodeSlug: 'same-tree', source: 'neetcode' },
  { name: 'Subtree of Another Tree', slug: 'subtree-of-another-tree', difficulty: 'Easy', topic: 'Trees', leetcodeSlug: 'subtree-of-another-tree', source: 'neetcode' },
  { name: 'Count Good Nodes in Binary Tree', slug: 'count-good-nodes', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'count-good-nodes-in-binary-tree', source: 'neetcode' },
  { name: 'Kth Smallest Element in BST', slug: 'kth-smallest-in-bst', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'kth-smallest-element-in-a-bst', source: 'neetcode' },
  { name: 'Construct Binary Tree from Preorder and Inorder', slug: 'construct-binary-tree-preorder-inorder', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'construct-binary-tree-from-preorder-and-inorder-traversal', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=ihj4IQGZ2zc' },
  { name: 'Binary Tree Right Side View', slug: 'binary-tree-right-side-view', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'binary-tree-right-side-view', source: 'neetcode' },
  { name: 'Path Sum II', slug: 'path-sum-ii', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'path-sum-ii', source: 'striver-a2z' },
  { name: 'Flatten Binary Tree to Linked List', slug: 'flatten-binary-tree', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'flatten-binary-tree-to-linked-list', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=sWf7k1x9XR4' },
  { name: 'Morris Inorder Traversal', slug: 'morris-traversal', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'binary-tree-inorder-traversal', source: 'striver-a2z', dryRunResources: [{ label: 'Morris Traversal - GFG', url: 'https://www.geeksforgeeks.org/morris-traversal-for-inorder/', type: 'article' }] },
  { name: 'Delete Node in BST', slug: 'delete-node-bst', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'delete-node-in-a-bst', source: 'neetcode' },
  { name: 'Insert into BST', slug: 'insert-into-bst', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'insert-into-a-binary-search-tree', source: 'neetcode' },
  { name: 'Recover Binary Search Tree', slug: 'recover-bst', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'recover-binary-search-tree', source: 'striver-a2z' },
  { name: 'Symmetric Tree', slug: 'symmetric-tree', difficulty: 'Easy', topic: 'Trees', leetcodeSlug: 'symmetric-tree', source: 'neetcode', dryRunResources: [{ label: 'Symmetric Tree - GFG', url: 'https://www.geeksforgeeks.org/symmetric-tree/', type: 'article' }] },
  { name: 'Populating Next Right Pointers', slug: 'populating-next-right-pointers', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'populating-next-right-pointers-in-each-node', source: 'striver-a2z' },
  { name: 'Lowest Common Ancestor of Binary Tree', slug: 'lca-binary-tree', difficulty: 'Medium', topic: 'Trees', leetcodeSlug: 'lowest-common-ancestor-of-a-binary-tree', source: 'neetcode' },

  // ── Heaps (extended) ───────────────────────────────────────────────────────
  { name: 'Merge K Sorted Lists', slug: 'merge-k-sorted-lists', difficulty: 'Hard', topic: 'Heaps', leetcodeSlug: 'merge-k-sorted-lists', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=q5a5OiGbT6Q' },
  { name: 'Top K Frequent Words', slug: 'top-k-frequent-words', difficulty: 'Medium', topic: 'Heaps', leetcodeSlug: 'top-k-frequent-words', source: 'neetcode' },
  { name: 'Last Stone Weight', slug: 'last-stone-weight', difficulty: 'Easy', topic: 'Heaps', leetcodeSlug: 'last-stone-weight', source: 'neetcode' },
  { name: 'Kth Largest in a Stream', slug: 'kth-largest-stream', difficulty: 'Easy', topic: 'Heaps', leetcodeSlug: 'kth-largest-element-in-a-stream', source: 'neetcode' },
  { name: 'IPO (Maximum Capital)', slug: 'ipo', difficulty: 'Hard', topic: 'Heaps', leetcodeSlug: 'ipo', source: 'neetcode' },
  { name: 'Hand of Straights', slug: 'hand-of-straights', difficulty: 'Medium', topic: 'Heaps', leetcodeSlug: 'hand-of-straights', source: 'neetcode' },

  // ── Dynamic Programming (extended) ─────────────────────────────────────────
  { name: 'Min Cost Climbing Stairs', slug: 'min-cost-climbing-stairs', difficulty: 'Easy', topic: 'Dynamic Programming', leetcodeSlug: 'min-cost-climbing-stairs', source: 'neetcode' },
  { name: 'Partition Equal Subset Sum', slug: 'partition-equal-subset-sum', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'partition-equal-subset-sum', source: 'striver-a2z', resourceUrl: 'https://www.youtube.com/watch?v=66clXUwAIe0', dryRunResources: [{ label: 'Subset Sum DP - GFG', url: 'https://www.geeksforgeeks.org/partition-problem-dp-18/', type: 'article' }] },
  { name: 'Target Sum', slug: 'target-sum', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'target-sum', source: 'neetcode' },
  { name: 'Interleaving String', slug: 'interleaving-string', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'interleaving-string', source: 'neetcode' },
  { name: 'Distinct Subsequences', slug: 'distinct-subsequences', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'distinct-subsequences', source: 'striver-a2z' },
  { name: 'Longest Common Subsequence', slug: 'longest-common-subsequence', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'longest-common-subsequence', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=Ua0GhsJSlWM', dryRunResources: [{ label: 'LCS - GFG', url: 'https://www.geeksforgeeks.org/longest-common-subsequence-dp-4/', type: 'article' }] },
  { name: 'String Edit Distance', slug: 'string-edit-distance', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'edit-distance', source: 'striver-a2z' },
  { name: 'Wildcard Matching', slug: 'wildcard-matching', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'wildcard-matching', source: 'striver-a2z' },
  { name: 'Matrix Chain Multiplication', slug: 'matrix-chain-multiplication', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'minimum-score-triangulation-of-polygon', source: 'striver-a2z', dryRunResources: [{ label: 'MCM - GFG', url: 'https://www.geeksforgeeks.org/matrix-chain-multiplication-dp-8/', type: 'article' }] },
  { name: 'Minimum Path Sum', slug: 'minimum-path-sum', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'minimum-path-sum', source: 'neetcode' },
  { name: 'Triangle Minimum Path', slug: 'triangle', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'triangle', source: 'striver-a2z' },
  { name: 'Maximal Square', slug: 'maximal-square', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'maximal-square', source: 'neetcode' },
  { name: 'Largest Rectangle in Histogram', slug: 'largest-rectangle-histogram', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'largest-rectangle-in-histogram', source: 'striver-a2z', dryRunResources: [{ label: 'Histogram Stack - GFG', url: 'https://www.geeksforgeeks.org/largest-rectangle-under-histogram/', type: 'article' }] },
  { name: 'Stock Buy Sell with Cooldown', slug: 'best-time-to-buy-and-sell-stock-with-cooldown', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'best-time-to-buy-and-sell-stock-with-cooldown', source: 'neetcode' },
  { name: 'Stock Buy Sell with Transaction Fee', slug: 'best-time-to-buy-sell-stock-transaction-fee', difficulty: 'Medium', topic: 'Dynamic Programming', leetcodeSlug: 'best-time-to-buy-and-sell-stock-with-transaction-fee', source: 'neetcode' },
  { name: 'Stock Buy Sell IV (K transactions)', slug: 'best-time-buy-sell-k-transactions', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'best-time-to-buy-and-sell-stock-iv', source: 'striver-a2z' },
  { name: 'Palindrome Partitioning II', slug: 'palindrome-partitioning-ii', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'palindrome-partitioning-ii', source: 'striver-a2z' },
  { name: 'Minimum Insertions to Make Palindrome', slug: 'minimum-insertions-palindrome', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'minimum-insertion-steps-to-make-a-string-palindrome', source: 'striver-a2z' },
  { name: 'Russian Doll Envelopes', slug: 'russian-doll-envelopes', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'russian-doll-envelopes', source: 'neetcode' },
  { name: 'Regular Expression Matching', slug: 'regular-expression-matching', difficulty: 'Hard', topic: 'Dynamic Programming', leetcodeSlug: 'regular-expression-matching', source: 'neetcode' },

  // ── Advanced Graphs (extended) ─────────────────────────────────────────────
  { name: "Kruskal's MST", slug: 'kruskals-mst', difficulty: 'Medium', topic: 'Advanced Graphs', leetcodeSlug: 'min-cost-to-connect-all-points', source: 'striver-a2z', dryRunResources: [{ label: "Kruskal's - GFG", url: 'https://www.geeksforgeeks.org/kruskals-minimum-spanning-tree-algorithm-greedy-algo-2/', type: 'article' }] },
  { name: 'Bellman-Ford Algorithm', slug: 'bellman-ford', difficulty: 'Medium', topic: 'Advanced Graphs', leetcodeSlug: 'network-delay-time', source: 'striver-a2z', dryRunResources: [{ label: 'Bellman-Ford - GFG', url: 'https://www.geeksforgeeks.org/bellman-ford-algorithm-dp-23/', type: 'article' }] },
  { name: 'Find Critical and Pseudo-Critical Edges', slug: 'critical-edges-mst', difficulty: 'Hard', topic: 'Advanced Graphs', leetcodeSlug: 'find-critical-and-pseudo-critical-edges-in-minimum-spanning-tree', source: 'striver-a2z' },
  { name: 'Strongly Connected Components (Kosaraju)', slug: 'scc-kosaraju', difficulty: 'Hard', topic: 'Advanced Graphs', leetcodeSlug: 'number-of-strongly-connected-components', source: 'striver-a2z', dryRunResources: [{ label: "Kosaraju's SCC - GFG", url: 'https://www.geeksforgeeks.org/kosaraju-algorithm-for-strongly-connected-components/', type: 'article' }] },
  { name: 'Articulation Points (Bridges)', slug: 'bridges-in-graph', difficulty: 'Hard', topic: 'Advanced Graphs', leetcodeSlug: 'critical-connections-in-a-network', source: 'striver-a2z', dryRunResources: [{ label: 'Bridges - GFG', url: 'https://www.geeksforgeeks.org/bridge-in-a-graph/', type: 'article' }] },
  { name: 'Path With Minimum Effort', slug: 'path-with-minimum-effort', difficulty: 'Medium', topic: 'Advanced Graphs', leetcodeSlug: 'path-with-minimum-effort', source: 'striver-a2z' },
  { name: 'Swim in Rising Water', slug: 'swim-in-rising-water', difficulty: 'Hard', topic: 'Advanced Graphs', leetcodeSlug: 'swim-in-rising-water', source: 'neetcode' },
  { name: 'Reconstruct Itinerary', slug: 'reconstruct-itinerary', difficulty: 'Hard', topic: 'Advanced Graphs', leetcodeSlug: 'reconstruct-itinerary', source: 'neetcode' },

  // ── Linked Lists ───────────────────────────────────────────────────────────
  { name: 'Reverse Linked List', slug: 'reverse-linked-list', difficulty: 'Easy', topic: 'Linked Lists', leetcodeSlug: 'reverse-linked-list', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=G0_I-ZF0S38', dryRunResources: [{ label: 'Reverse LL - GFG', url: 'https://www.geeksforgeeks.org/reverse-a-linked-list/', type: 'article' }] },
  { name: 'Merge Two Sorted Lists', slug: 'merge-two-sorted-lists', difficulty: 'Easy', topic: 'Linked Lists', leetcodeSlug: 'merge-two-sorted-lists', source: 'neetcode' },
  { name: 'Middle of Linked List', slug: 'middle-of-linked-list', difficulty: 'Easy', topic: 'Linked Lists', leetcodeSlug: 'middle-of-the-linked-list', source: 'striver-a2z', dryRunResources: [{ label: 'Floyd Slow-Fast - GFG', url: 'https://www.geeksforgeeks.org/find-the-middle-of-a-given-linked-list/', type: 'article' }] },
  { name: 'Linked List Cycle II', slug: 'linked-list-cycle-ii', difficulty: 'Medium', topic: 'Linked Lists', leetcodeSlug: 'linked-list-cycle-ii', source: 'striver-a2z', dryRunResources: [{ label: 'Cycle Start Detection - GFG', url: 'https://www.geeksforgeeks.org/find-first-node-of-loop-in-a-linked-list/', type: 'article' }] },
  { name: 'Reorder List', slug: 'reorder-list', difficulty: 'Medium', topic: 'Linked Lists', leetcodeSlug: 'reorder-list', source: 'neetcode' },
  { name: 'Add Two Numbers', slug: 'add-two-numbers', difficulty: 'Medium', topic: 'Linked Lists', leetcodeSlug: 'add-two-numbers', source: 'neetcode' },
  { name: 'Copy List with Random Pointer', slug: 'copy-list-random-pointer', difficulty: 'Medium', topic: 'Linked Lists', leetcodeSlug: 'copy-list-with-random-pointer', source: 'neetcode' },
  { name: 'LRU Cache', slug: 'lru-cache', difficulty: 'Medium', topic: 'Linked Lists', leetcodeSlug: 'lru-cache', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=7ABFKPK2hD4', dryRunResources: [{ label: 'LRU Cache Design - GFG', url: 'https://www.geeksforgeeks.org/lru-cache-implementation/', type: 'article' }] },
  { name: 'Reverse Nodes in k-Group', slug: 'reverse-nodes-k-group', difficulty: 'Hard', topic: 'Linked Lists', leetcodeSlug: 'reverse-nodes-in-k-group', source: 'striver-a2z' },
  { name: 'Flatten a Multilevel Doubly Linked List', slug: 'flatten-multilevel-dll', difficulty: 'Medium', topic: 'Linked Lists', leetcodeSlug: 'flatten-a-multilevel-doubly-linked-list', source: 'striver-a2z' },
  { name: 'Intersection of Two Linked Lists', slug: 'intersection-two-linked-lists', difficulty: 'Easy', topic: 'Linked Lists', leetcodeSlug: 'intersection-of-two-linked-lists', source: 'striver-a2z', dryRunResources: [{ label: 'LL Intersection - GFG', url: 'https://www.geeksforgeeks.org/write-a-function-to-get-the-intersection-point-of-two-linked-lists/', type: 'article' }] },

  // ── Stacks & Queues ────────────────────────────────────────────────────────
  { name: 'Valid Parentheses', slug: 'valid-parentheses', difficulty: 'Easy', topic: 'Stacks & Queues', leetcodeSlug: 'valid-parentheses', source: 'neetcode', resourceUrl: 'https://www.youtube.com/watch?v=WTzjTskDFMg', dryRunResources: [{ label: 'Valid Parentheses - GFG', url: 'https://www.geeksforgeeks.org/check-for-balanced-parentheses-in-an-expression/', type: 'article' }] },
  { name: 'Min Stack', slug: 'min-stack', difficulty: 'Medium', topic: 'Stacks & Queues', leetcodeSlug: 'min-stack', source: 'neetcode' },
  { name: 'Evaluate Reverse Polish Notation', slug: 'evaluate-reverse-polish-notation', difficulty: 'Medium', topic: 'Stacks & Queues', leetcodeSlug: 'evaluate-reverse-polish-notation', source: 'neetcode' },
  { name: 'Daily Temperatures', slug: 'daily-temperatures', difficulty: 'Medium', topic: 'Stacks & Queues', leetcodeSlug: 'daily-temperatures', source: 'neetcode', dryRunResources: [{ label: 'Monotonic Stack - GFG', url: 'https://www.geeksforgeeks.org/monotonic-stack/', type: 'article' }] },
  { name: 'Car Fleet', slug: 'car-fleet', difficulty: 'Medium', topic: 'Stacks & Queues', leetcodeSlug: 'car-fleet', source: 'neetcode' },
  { name: 'Next Greater Element', slug: 'next-greater-element', difficulty: 'Easy', topic: 'Stacks & Queues', leetcodeSlug: 'next-greater-element-i', source: 'striver-a2z', dryRunResources: [{ label: 'Next Greater - GFG', url: 'https://www.geeksforgeeks.org/next-greater-element/', type: 'article' }] },
  { name: 'Implement Queue using Stacks', slug: 'implement-queue-using-stacks', difficulty: 'Easy', topic: 'Stacks & Queues', leetcodeSlug: 'implement-queue-using-stacks', source: 'striver-a2z' },
  { name: 'Implement Stack using Queues', slug: 'implement-stack-using-queues', difficulty: 'Easy', topic: 'Stacks & Queues', leetcodeSlug: 'implement-stack-using-queues', source: 'striver-a2z' },
  { name: 'Online Stock Span', slug: 'online-stock-span', difficulty: 'Medium', topic: 'Stacks & Queues', leetcodeSlug: 'online-stock-span', source: 'neetcode' },
  { name: 'Asteroid Collision', slug: 'asteroid-collision', difficulty: 'Medium', topic: 'Stacks & Queues', leetcodeSlug: 'asteroid-collision', source: 'striver-a2z' },

  // ── Greedy ─────────────────────────────────────────────────────────────────
  { name: 'Assign Cookies', slug: 'assign-cookies', difficulty: 'Easy', topic: 'Greedy', leetcodeSlug: 'assign-cookies', source: 'striver-a2z', dryRunResources: [{ label: 'Greedy Basics - GFG', url: 'https://www.geeksforgeeks.org/greedy-algorithms/', type: 'article' }] },
  { name: 'Fractional Knapsack', slug: 'fractional-knapsack', difficulty: 'Medium', topic: 'Greedy', leetcodeSlug: 'maximum-units-on-a-truck', source: 'striver-a2z', dryRunResources: [{ label: 'Fractional Knapsack - GFG', url: 'https://www.geeksforgeeks.org/fractional-knapsack-problem/', type: 'article' }] },
  { name: 'Activity Selection', slug: 'activity-selection', difficulty: 'Medium', topic: 'Greedy', leetcodeSlug: 'maximum-length-of-pair-chain', source: 'striver-a2z', dryRunResources: [{ label: 'Activity Selection - GFG', url: 'https://www.geeksforgeeks.org/activity-selection-problem-greedy-algo-1/', type: 'article' }] },
  { name: 'Gas Station', slug: 'gas-station', difficulty: 'Medium', topic: 'Greedy', leetcodeSlug: 'gas-station', source: 'neetcode' },
  { name: 'Partition Labels', slug: 'partition-labels', difficulty: 'Medium', topic: 'Greedy', leetcodeSlug: 'partition-labels', source: 'neetcode' },
  { name: 'Minimum Number of Arrows to Burst Balloons', slug: 'min-arrows-burst-balloons', difficulty: 'Medium', topic: 'Greedy', leetcodeSlug: 'minimum-number-of-arrows-to-burst-balloons', source: 'neetcode' },
  { name: 'Non-overlapping Intervals', slug: 'non-overlapping-intervals', difficulty: 'Medium', topic: 'Greedy', leetcodeSlug: 'non-overlapping-intervals', source: 'neetcode' },

  // ── Bit Manipulation ───────────────────────────────────────────────────────
  { name: 'Single Number', slug: 'single-number', difficulty: 'Easy', topic: 'Bit Manipulation', leetcodeSlug: 'single-number', source: 'neetcode', dryRunResources: [{ label: 'XOR Trick - GFG', url: 'https://www.geeksforgeeks.org/find-element-appears-once-others-appear-multiple-times/', type: 'article' }] },
  { name: 'Number of 1 Bits', slug: 'number-of-1-bits', difficulty: 'Easy', topic: 'Bit Manipulation', leetcodeSlug: 'number-of-1-bits', source: 'neetcode', dryRunResources: [{ label: 'Bit Counting - GFG', url: 'https://www.geeksforgeeks.org/count-set-bits-in-an-integer/', type: 'article' }] },
  { name: 'Counting Bits', slug: 'counting-bits', difficulty: 'Easy', topic: 'Bit Manipulation', leetcodeSlug: 'counting-bits', source: 'neetcode' },
  { name: 'Reverse Bits', slug: 'reverse-bits', difficulty: 'Easy', topic: 'Bit Manipulation', leetcodeSlug: 'reverse-bits', source: 'neetcode' },
  { name: 'Missing Number', slug: 'missing-number', difficulty: 'Easy', topic: 'Bit Manipulation', leetcodeSlug: 'missing-number', source: 'neetcode' },
  { name: 'Sum of Two Integers (No +)', slug: 'sum-two-integers', difficulty: 'Medium', topic: 'Bit Manipulation', leetcodeSlug: 'sum-of-two-integers', source: 'neetcode' },
  { name: 'Reverse Integer (Bit)', slug: 'reverse-bits-alt', difficulty: 'Medium', topic: 'Bit Manipulation', leetcodeSlug: 'reverse-bits', source: 'striver-a2z' },
  { name: 'Find XOR of all Subsets', slug: 'xor-all-subsets', difficulty: 'Easy', topic: 'Bit Manipulation', leetcodeSlug: 'total-hamming-distance', source: 'striver-a2z', dryRunResources: [{ label: 'Bit Tricks - GFG', url: 'https://www.geeksforgeeks.org/bits-manipulation-important-tactics/', type: 'article' }] },
  { name: 'Power Set using Bitmask', slug: 'power-set-bitmask', difficulty: 'Medium', topic: 'Bit Manipulation', leetcodeSlug: 'subsets', source: 'striver-a2z', dryRunResources: [{ label: 'Bitmask Subsets - GFG', url: 'https://www.geeksforgeeks.org/power-set/', type: 'article' }] },
];

// ─── Seed Concepts ────────────────────────────────────────────────────────────
const SEED_CONCEPTS = [
  {
    name: "Kadane's Algorithm",
    topic: 'Arrays',
    summary: 'Dynamic programming technique to find maximum subarray sum in O(n).',
    resources: [
      { label: "Kadane's - GFG", url: 'https://www.geeksforgeeks.org/largest-sum-contiguous-subarray/', type: 'article' },
      { label: "Kadane's Video", url: 'https://www.youtube.com/watch?v=86CQq3pKSUw', type: 'video' },
    ],
  },
  {
    name: 'Prefix Sum',
    topic: 'Arrays',
    summary: 'Precompute cumulative sums to answer range sum queries in O(1).',
    resources: [
      { label: 'Prefix Sum - GFG', url: 'https://www.geeksforgeeks.org/prefix-sum-array-implementation-applications-competitive-programming/', type: 'article' },
    ],
  },
  {
    name: 'Dutch National Flag',
    topic: 'Arrays',
    summary: '3-way partitioning algorithm for sorting 0s, 1s, and 2s.',
    resources: [
      { label: 'Dutch Flag - GFG', url: 'https://www.geeksforgeeks.org/sort-an-array-of-0s-1s-and-2s/', type: 'article' },
    ],
  },
  {
    name: 'Sliding Window',
    topic: 'Sliding Window',
    summary: 'Maintain a window of elements, expand/shrink to find optimal subarray.',
    resources: [
      { label: 'Sliding Window - GFG', url: 'https://www.geeksforgeeks.org/window-sliding-technique/', type: 'article' },
      { label: 'Sliding Window Patterns', url: 'https://www.youtube.com/watch?v=p-ss2JNynmw', type: 'video' },
    ],
  },
  {
    name: 'Binary Search on Answer',
    topic: 'Binary Search',
    summary: 'Apply binary search on the result space, not just sorted arrays.',
    resources: [
      { label: 'BS on Answer - GFG', url: 'https://www.geeksforgeeks.org/binary-search-on-answer/', type: 'article' },
      { label: "Striver's BS Series", url: 'https://www.youtube.com/watch?v=W9QJ8HaRvJQ', type: 'video' },
    ],
  },
  {
    name: 'BFS & DFS',
    topic: 'Graphs',
    summary: 'Breadth-first and depth-first graph traversal algorithms.',
    resources: [
      { label: 'BFS - GFG', url: 'https://www.geeksforgeeks.org/breadth-first-search-or-bfs-for-a-graph/', type: 'article' },
      { label: 'DFS - GFG', url: 'https://www.geeksforgeeks.org/depth-first-search-or-dfs-for-a-graph/', type: 'article' },
      { label: 'Graph Visualizer', url: 'https://visualgo.net/en/dfsbfs', type: 'visualization' },
    ],
  },
  {
    name: 'Topological Sort',
    topic: 'Graphs',
    summary: 'Linear ordering of vertices in a Directed Acyclic Graph (DAG).',
    resources: [
      { label: 'Topo Sort - GFG', url: 'https://www.geeksforgeeks.org/topological-sorting/', type: 'article' },
    ],
  },
  {
    name: 'Memoization & Tabulation',
    topic: 'Dynamic Programming',
    summary: 'Top-down (memoization) and bottom-up (tabulation) DP approaches.',
    resources: [
      { label: 'DP Patterns - GFG', url: 'https://www.geeksforgeeks.org/dynamic-programming/', type: 'article' },
      { label: 'Striver DP Playlist', url: 'https://www.youtube.com/playlist?list=PLgUwDviBIf0qUlt5H_kiKYaNSqJ81PMMY', type: 'video' },
    ],
  },
];

// ─── CSV Parsing Logic ────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');

const parseArshCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const problems = [];
    const stream = fs.createReadStream(filePath);
    let currentRow = 0;
    
    // In Arsh's CSV:
    // Header is row 4 (index 3). Companies are cols 3, 4, 5, 6, 7.
    // difficulty is col 0, URL is col 1.
    const companyMap = {
      3: 'Microsoft',
      4: 'Adobe',
      5: 'Goldman Sachs',
      6: 'Intuit',
      7: 'Amazon'
    };

    let currentTopic = 'Arrays'; // Default/fallback

    const csvStream = csv.parse()
      .on('data', (row) => {
        currentRow++;
        if (currentRow <= 3) return; // Skip headers

        // Check if row is a topic header (e.g. empty row[0] and row[1] has topic name)
        if (!row[0] && row[1] && !row[1].toLowerCase().includes('http')) {
          currentTopic = row[1].trim();
          return;
        }

        const difficulty = row[0]?.trim();
        const url = row[1]?.trim();

        if (url && url.toLowerCase().includes('http')) {
          let leetcodeSlug = null;
          let gfgUrl = null;
          let resourceUrl = url;
          let slug = '';
          let name = '';

          if (url.includes('leetcode.com/problems/')) {
            leetcodeSlug = url.split('/problems/')[1].split('/')[0];
            slug = leetcodeSlug;
            name = leetcodeSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          } else if (url.includes('geeksforgeeks.org')) {
            gfgUrl = url;
            // Extract slug from GFG URL
            const parts = url.split('/').filter(p => p.length > 0);
            slug = parts[parts.length - 1]; // e.g. "chocolate-distribution-problem"
            name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          } else {
            // General external link
            const parts = url.split('/').filter(p => p.length > 0);
            slug = parts[parts.length - 1] || `problem-${currentRow}`;
            name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
          
          const companies = [];
          for (let i = 3; i <= 7; i++) {
            if (row[i] && row[i].includes('~')) {
              companies.push(companyMap[i]);
            }
          }

          problems.push({
            name,
            slug,
            difficulty: ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium',
            topic: currentTopic,
            leetcodeSlug,
            gfgUrl,
            resourceUrl,
            source: 'google-sheet',
            companies
          });
        }
      })
      .on('end', () => resolve(problems))
      .on('error', reject);

    stream.pipe(csvStream);
  });
};

// ─── Main Seed Function ───────────────────────────────────────────────────────
const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let upsertedProblems = 0;
    let upsertedConcepts = 0;

    // 1. Seed static JSON problems
    for (const problem of SEED_PROBLEMS) {
      await Problem.findOneAndUpdate(
        { slug: problem.slug },
        { $set: problem },
        { upsert: true, new: true }
      );
      upsertedProblems++;
    }

    // 2. Parse and Seed CSV files if they exist in scripts/
    const arshCsvPath = path.join(__dirname, 'DSA Sheet by Arsh (45-60 Days Plan) - Sheet1.csv');
    if (fs.existsSync(arshCsvPath)) {
      console.log('📄 Found Arsh CSV, parsing...');
      const csvProblems = await parseArshCSV(arshCsvPath);
      
      for (const problem of csvProblems) {
        // We use findOneAndUpdate to merge companies if problem already exists
        const existing = await Problem.findOne({ slug: problem.slug });
        if (existing) {
          // Merge unique companies
          const mergedCompanies = Array.from(new Set([...(existing.companies || []), ...problem.companies]));
          await Problem.updateOne({ _id: existing._id }, { $set: { companies: mergedCompanies } });
        } else {
          await Problem.create(problem);
          upsertedProblems++;
        }
      }
      console.log(`✅ Processed ${csvProblems.length} problems from Arsh Sheet.`);
    }

    // 3. Seed concepts
    for (const concept of SEED_CONCEPTS) {
      await Concept.findOneAndUpdate(
        { name: concept.name },
        { $set: concept },
        { upsert: true, new: true }
      );
      upsertedConcepts++;
    }

    console.log(`\n🎉 Database seed complete!`);
    console.log(`👉 Total problems in DB: ${upsertedProblems}`);
    console.log(`👉 Total concepts in DB: ${upsertedConcepts}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedDatabase();
